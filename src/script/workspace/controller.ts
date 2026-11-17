import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { proxy, subscribe } from "valtio/vanilla"
import type { AnalysisResponse } from "../analysis"
import type {
    ClientRequestId,
    ProjectId,
    RunIdentity,
    ScriptDiagnostic,
    ScriptRunEvent,
    SelectedInput,
    SourceSnapshot,
} from "../contracts"
import { type ImageSelector, ScriptControlsController } from "../controls"
import type { EditorAnalysisClient } from "../editor/analysisClient"
import { EDITOR_MARKER_OWNERS, type ScriptProjectModel } from "../editor/modelRegistry"
import type { PackageDeclarationAdapter } from "../editor/packageDeclarations"
import type { PackageCommands } from "../packages/adapters"
import { ScriptPackageController } from "../packages/controller"
import {
    type ProjectCommands,
    type ProjectControllerOptions,
    ScriptProjectController,
} from "../project"
import { type RunCommands, type RunEventSource, ScriptRunController, sameRevisions } from "../run"
import { presentDiagnostic } from "../run/presentation"

type CapturedSource = Pick<SourceSnapshot, "source" | "sourceRevision">

interface AnalysisAttempt {
    captured: CapturedSource
    response?: AnalysisResponse
}

export interface WorkspaceProject {
    id: ProjectId
    model: ScriptProjectModel
    controls: ScriptControlsController
    run: ScriptRunController
    state: { analysisReady: boolean }
    accepted?: Omit<SourceSnapshot, "contentHash">
    attempt?: AnalysisAttempt
    activation: number
    diagnostics: ScriptDiagnostic[]
    runtimeDiagnostics: ScriptDiagnostic[]
    typeScriptProblems: ScriptDiagnostic[]
    tokens: Set<string>
    listeners: Monaco.IDisposable[]
}

export interface WorkspaceOptions extends ProjectControllerOptions {
    run: RunCommands
    packageCommands: PackageCommands
    declarations: PackageDeclarationAdapter
    events: RunEventSource
    analysis: EditorAnalysisClient
    selectImage: ImageSelector
    revokeInput(token: string): Promise<void>
    disposeEditor(): void
    sourceDelay?: number
    valueDelay?: number
    bindHints?(controls: ScriptControlsController): Monaco.IDisposable
}

export function controlsReady(
    controls: readonly {
        descriptor: { type: string; required?: boolean }
        selection: unknown
        error: string | null
        selecting: boolean
    }[],
): boolean {
    return controls.every(
        ({ descriptor, selection, error, selecting }) =>
            !error &&
            !selecting &&
            (descriptor.type !== "image" || !descriptor.required || selection),
    )
}

export class ScriptWorkspaceController {
    readonly state = proxy({
        owner: null as ProjectId | null,
        live: false,
        stopPending: false,
        preparing: false,
        closing: false,
        error: null as string | null,
    })
    readonly projects: ScriptProjectController
    readonly packages: ScriptPackageController
    readonly #contexts = new Map<ProjectId, WorkspaceProject>()
    readonly #persisted = new Map<ProjectId, string>()
    #disposed = false
    #analysisTimer?: ReturnType<typeof setTimeout>
    #liveTimer?: ReturnType<typeof setTimeout>
    #queuedLive?: WorkspaceProject
    #stopEpoch = 0

    constructor(private readonly options: WorkspaceOptions) {
        this.packages = new ScriptPackageController({
            commands: options.packageCommands,
            declarations: options.declarations,
            canChange: (id) => {
                const project = this.getProject(id)
                return Boolean(project && this.#canChangePackages(project))
            },
            onStart: () => this.#disableLive(),
            onRevisionChange: (id) => {
                this.getProject(id)?.run.invalidateTrust()
                this.#disableLive()
            },
        })
        const commands: ProjectCommands = {
            ...options.commands,
            create: async (name) => {
                const project = await options.commands.create(name)
                this.#persisted.set(project.manifest.projectId, project.source)
                return project
            },
            open: async (id) => {
                const project = await options.commands.open(id)
                this.#persisted.set(id, project.source)
                return project
            },
            save: async (id, source, revision) => {
                await this.#verifySavedSource(id)
                const acknowledgement = await options.commands.save(id, source, revision)
                if (acknowledgement === revision) this.#persisted.set(id, source)
                return acknowledgement
            },
        }
        this.projects = new ScriptProjectController({
            ...options,
            commands,
            models: {
                open: (stored) => {
                    const model = options.models.open(stored)
                    this.#attach(stored.manifest.projectId, model)
                    return model
                },
            },
            editor: {
                ...options.editor,
                activate: (model, viewState) => {
                    options.editor.activate(model, viewState)
                    const id = this.projects.state.currentProjectId
                    const project = id && this.#contexts.get(id)
                    if (!project) return
                    this.#disableLive()
                    clearTimeout(this.#analysisTimer)
                    project.activation++
                    project.run.invalidateTrust()
                    this.state.error = null
                    this.packages.activate(id, project.model.uri.toString())
                    void this.#analyze(project)
                },
            },
        })
    }

    getProject(id: ProjectId | null): WorkspaceProject | undefined {
        return id ? this.#contexts.get(id) : undefined
    }

    async open(id: ProjectId): Promise<void> {
        this.#assertNavigable()
        const previous = this.getProject(this.projects.state.currentProjectId)
        if (previous) this.#leave(previous)
        await this.projects.open(id)
        if (this.projects.state.currentProjectId !== id) return
        try {
            await this.#verifySavedSource(id)
        } catch (error) {
            if (this.projects.state.currentProjectId === id) this.#report(error)
        }
    }

    async create(name: string): Promise<void> {
        this.#assertNavigable()
        const previous = this.getProject(this.projects.state.currentProjectId)
        if (previous) this.#leave(previous)
        await this.projects.create(name)
    }

    #assertNavigable(): void {
        if (this.#disposed || this.state.closing)
            throw new Error("Wait for the workspace to finish closing.")
    }

    #leave(project: WorkspaceProject): void {
        this.#disableLive()
        clearTimeout(this.#analysisTimer)
        project.activation++
        project.run.invalidateTrust()
    }

    #canChangePackages(project: WorkspaceProject): boolean {
        return (
            this.#isCurrent(project) &&
            !this.state.closing &&
            !this.state.preparing &&
            this.state.owner !== project.id &&
            project.run.state.trust !== "pending"
        )
    }

    setLive(enabled: boolean): void {
        const project = this.getProject(this.projects.state.currentProjectId)
        if (
            !enabled ||
            !project ||
            project.run.state.trust !== "trusted" ||
            this.packages.readyRevision(project.id) === undefined
        ) {
            this.#disableLive()
            return
        }
        this.state.live = true
        this.#scheduleLive(project, 0)
    }

    #disableLive(): void {
        this.state.live = false
        this.#clearLiveQueue()
    }

    #clearLiveQueue(): void {
        clearTimeout(this.#liveTimer)
        this.#queuedLive = undefined
    }

    #scheduleLive(project: WorkspaceProject, delay: number): void {
        if (!this.state.live || !this.#isCurrent(project)) return
        this.#clearLiveQueue()
        if (delay === 0) {
            this.#queuedLive = project
            this.#pumpLive()
            return
        }
        this.#liveTimer = setTimeout(() => {
            this.#queuedLive = project
            this.#pumpLive()
        }, delay)
    }

    #pumpLive(): void {
        const project = this.#queuedLive
        if (!project || this.state.preparing || this.state.stopPending || this.state.closing) return
        if (!this.state.live || !this.#isCurrent(project)) {
            this.#queuedLive = undefined
            return
        }
        if (project.run.state.admitting || project.run.state.stopping) return
        if (this.state.owner && this.state.owner !== project.id) return
        this.#queuedLive = undefined
        if (project.accepted && controlsReady(project.controls.state.controls))
            void this.run(project)
    }

    #isCurrent(project: WorkspaceProject, activation = project.activation): boolean {
        return (
            !this.#disposed &&
            !this.projects.state.loading &&
            project.activation === activation &&
            this.projects.state.currentProjectId === project.id
        )
    }

    #attach(id: ProjectId, model: ScriptProjectModel): void {
        const controls = new ScriptControlsController({
            projectId: id,
            project: model,
            analysis: {
                analyze: async (request) => {
                    const attempt = project.attempt
                    const response = await this.options.analysis.analyze(request)
                    if (
                        attempt &&
                        request.source === attempt.captured.source &&
                        request.sourceRevision === attempt.captured.sourceRevision
                    )
                        attempt.response = response
                    return response
                },
                dispose() {},
            },
            selectImage: async (request) => {
                const activation = project.activation
                const result = await this.options.selectImage(request)
                if (!result) return null
                if (
                    request.signal.aborted ||
                    this.#disposed ||
                    result.inputId !== request.inputId ||
                    project.activation !== activation ||
                    this.projects.state.currentProjectId !== id
                ) {
                    this.#revoke(tokenOf(result))
                    return null
                }
                return result
            },
        })
        const run = new ScriptRunController({
            projectId: id,
            commands: {
                ...this.options.run,
                trust: async () => {
                    this.state.error = null
                    const captured = sourceOf(project)
                    const activation = project.activation
                    const revision = this.packages.readyRevision(id)
                    try {
                        if (revision === undefined)
                            throw new Error(
                                "Load or restore the script’s packages before trusting it.",
                            )
                        await this.#prepareSaved(project, captured, activation)
                        if (revision !== this.packages.readyRevision(id))
                            throw new Error(
                                "The script’s packages changed. Review them and try again.",
                            )
                        if (revision === null) await this.options.run.trust(id, captured.source)
                        else await this.options.run.trust(id, captured.source, revision)
                        if (
                            this.#isCurrent(project, activation) &&
                            (!matchesSource(project, captured) ||
                                revision !== this.packages.readyRevision(id))
                        )
                            throw new Error(
                                "The script or its packages changed while approval was pending. Review it and try again.",
                            )
                    } catch (error) {
                        if (this.#isCurrent(project, activation)) {
                            this.#report(error)
                            if (String(error).includes("package revision changed"))
                                void this.packages.refresh()
                        }
                        throw error
                    }
                },
                run: async (request) => {
                    const activation = project.activation
                    try {
                        return await this.options.run.run(request)
                    } catch (error) {
                        if (
                            this.#isCurrent(project, activation) &&
                            String(error).includes("script project is untrusted")
                        ) {
                            run.invalidateTrust()
                            this.#disableLive()
                        }
                        if (this.#isCurrent(project, activation)) void this.packages.refresh()
                        throw error
                    }
                },
                stop: async () => {
                    if (this.state.owner !== id || this.state.stopPending)
                        throw new Error("This project no longer owns the active script.")
                    if (this.projects.state.currentProjectId === id) this.#disableLive()
                    this.#stopEpoch++
                    this.state.stopPending = true
                    try {
                        if (run.state.phase === "submitting" && run.state.admitting) {
                            await new Promise<void>((resolve) => {
                                const unlisten = subscribe(run.state, () => {
                                    if (run.state.phase === "submitting" && run.state.admitting)
                                        return
                                    unlisten()
                                    resolve()
                                })
                            })
                        }
                        if (run.state.active) await this.options.run.stop()
                    } finally {
                        this.state.stopPending = false
                        this.#releaseOwner(project)
                        this.#pumpLive()
                    }
                },
            },
            events: {
                subscribe: (listener) =>
                    this.options.events.subscribe((event) => {
                        if (listener(event)) this.#runtimeMarker(project, event)
                    }),
            },
        })
        const project: WorkspaceProject = {
            id,
            model,
            controls,
            run,
            state: proxy({ analysisReady: false }),
            activation: 0,
            diagnostics: [],
            runtimeDiagnostics: [],
            typeScriptProblems: [],
            tokens: new Set(),
            listeners: [],
        }
        this.#contexts.set(id, project)
        this.#updateRevisions(project)
        project.listeners.push(
            model.onDidChangeRevision(() => {
                project.accepted = undefined
                project.state.analysisReady = false
                project.diagnostics = []
                project.typeScriptProblems = []
                this.#clearRuntimeMarkers(project)
                this.#setEditorProblems(project)
                model.setDiagnostics(EDITOR_MARKER_OWNERS.analyzer, [])
                this.#updateRevisions(project)
                if (id === this.projects.state.currentProjectId) {
                    this.#clearLiveQueue()
                    clearTimeout(this.#analysisTimer)
                    const activation = project.activation
                    this.#analysisTimer = setTimeout(() => {
                        if (this.#isCurrent(project, activation)) void this.#analyze(project, true)
                    }, this.options.sourceDelay ?? 180)
                }
            }),
            controls.onDidChange((change) => {
                const previous = run.state.desired
                const next = this.#updateRevisions(project)
                if (previous && !sameRevisions(previous, next)) this.#clearRuntimeMarkers(project)
                const tokens = new Set(controls.runtimeSnapshot().inputs.map(tokenOf))
                for (const token of project.tokens) if (!tokens.has(token)) this.#revoke(token)
                project.tokens = tokens
                if (change.kind === "value") {
                    this.#scheduleLive(
                        project,
                        change.phase === "commit" ? 0 : (this.options.valueDelay ?? 180),
                    )
                } else if (change.kind === "input") {
                    this.#scheduleLive(project, 0)
                }
            }),
            {
                dispose: subscribe(run.state, () => {
                    if (this.#isCurrent(project) && run.state.trust !== "trusted")
                        this.#disableLive()
                    this.#releaseOwner(project)
                    this.#pumpLive()
                }),
            },
        )
        const hints = this.options.bindHints?.(controls)
        if (hints) project.listeners.push(hints)
    }

    #updateRevisions(project: WorkspaceProject) {
        const { valueRevision, inputRevision } = project.controls.state
        const revisions = { sourceRevision: project.model.revision, valueRevision, inputRevision }
        project.run.setDesiredRevisions(revisions)
        return revisions
    }

    async analyzeCurrent(): Promise<void> {
        const project = this.getProject(this.projects.state.currentProjectId)
        clearTimeout(this.#analysisTimer)
        if (project) await this.#analyze(project, true)
    }

    async #analyze(project: WorkspaceProject, scheduleRun = false): Promise<void> {
        const attempt: AnalysisAttempt = { captured: sourceOf(project) }
        project.attempt = attempt
        project.accepted = undefined
        project.state.analysisReady = false
        const accepted = await project.controls.analyze()
        if (
            this.#disposed ||
            project.model.model.isDisposed() ||
            project.attempt !== attempt ||
            !matchesSource(project, attempt.captured)
        )
            return
        const response =
            attempt.response?.sourceRevision === attempt.captured.sourceRevision
                ? attempt.response
                : undefined
        const diagnostics = response?.diagnostics ?? []
        project.diagnostics = diagnostics
        this.#setEditorProblems(project)
        this.#setMarkers(project, EDITOR_MARKER_OWNERS.analyzer, diagnostics)
        if (!accepted || response?.instrumentedSource === undefined) return
        project.accepted = {
            ...attempt.captured,
            instrumentedSource: response.instrumentedSource,
            sourceMap: response.sourceMap,
        }
        project.state.analysisReady = true
        if (scheduleRun) this.#scheduleLive(project, 0)
    }

    setTypeScriptProblems(project: WorkspaceProject, diagnostics: ScriptDiagnostic[]): void {
        project.typeScriptProblems = diagnostics
        this.#setEditorProblems(project)
    }

    #setEditorProblems(project: WorkspaceProject): void {
        project.run.setEditorProblems([...project.diagnostics, ...project.typeScriptProblems])
    }

    #setMarkers(
        project: WorkspaceProject,
        owner: (typeof EDITOR_MARKER_OWNERS)[keyof typeof EDITOR_MARKER_OWNERS],
        diagnostics: ScriptDiagnostic[],
    ): void {
        const model = project.model.model
        const markers = diagnostics.flatMap((diagnostic) => {
            const location = diagnostic.location
            if (!location || location.file !== project.model.uri.toString()) return []
            const { start, end } = location.range
            if (!inModel(model, start) || !inModel(model, end) || start.offset > end.offset)
                return []
            const safe = presentDiagnostic(diagnostic)
            return [
                {
                    startLineNumber: start.line,
                    startColumn: start.column,
                    endLineNumber: end.line,
                    endColumn: end.column,
                    severity: { info: 2, warning: 4, error: 8 }[safe.severity],
                    message: safe.message,
                    source: safe.source,
                    code: safe.code,
                },
            ]
        })
        project.model.setDiagnostics(owner, diagnostics.map(presentDiagnostic), markers)
    }

    #runtimeMarker(project: WorkspaceProject, event: ScriptRunEvent): void {
        if (
            project.model.model.isDisposed() ||
            !project.run.state.desired ||
            !sameIdentity(project.run.state.identity, event.identity) ||
            !sameRevisions(project.run.state.desired, event.identity) ||
            event.identity.sourceRevision !== project.model.revision
        )
            return
        if (event.type === "queued") this.#clearRuntimeMarkers(project)
        if (
            (event.type === "diagnostic" || event.type === "failed") &&
            event.diagnostic.location &&
            !project.runtimeDiagnostics.some(
                (item) => JSON.stringify(item) === JSON.stringify(event.diagnostic),
            )
        ) {
            project.runtimeDiagnostics.push(event.diagnostic)
            this.#setMarkers(project, EDITOR_MARKER_OWNERS.runtime, project.runtimeDiagnostics)
        }
    }

    #clearRuntimeMarkers(project: WorkspaceProject): void {
        project.runtimeDiagnostics = []
        project.model.setDiagnostics(EDITOR_MARKER_OWNERS.runtime, [])
    }

    async #verifySavedSource(id: ProjectId): Promise<void> {
        const project = this.getProject(id)
        const activation = project?.activation
        const expected = this.#persisted.get(id)
        const persisted = await this.options.commands.open(id)
        if (this.#persisted.get(id) !== expected)
            throw new Error(
                "The script was saved while preparing. Try again with the current source.",
            )
        if (persisted.manifest.projectId !== id || persisted.source !== expected) {
            if (project && project.activation === activation) {
                project.run.invalidateTrust()
                if (this.projects.state.currentProjectId === id) this.#disableLive()
            }
            throw new Error(
                "The saved script changed outside this workspace. Close and reopen the workspace to load the saved version.",
            )
        }
    }

    async #prepareSaved(
        project: WorkspaceProject,
        captured: CapturedSource,
        activation: number,
    ): Promise<void> {
        await this.projects.flush(project.id)
        await this.#verifySavedSource(project.id)
        if (
            !this.#isCurrent(project, activation) ||
            !matchesSource(project, captured) ||
            this.#persisted.get(project.id) !== captured.source
        )
            throw new Error(
                "The script changed while preparing. Try again with the current source.",
            )
    }

    async run(project: WorkspaceProject): Promise<void> {
        const source = project.accepted
        const run = project.run
        const packageRevision = this.packages.readyRevision(project.id)
        if (
            !source ||
            packageRevision === undefined ||
            this.state.preparing ||
            this.state.stopPending ||
            this.state.closing ||
            run.state.stopping ||
            run.state.admitting ||
            this.projects.state.loading ||
            this.projects.state.currentProjectId !== project.id ||
            (this.state.owner && this.state.owner !== project.id) ||
            run.state.trust !== "trusted" ||
            !controlsReady(project.controls.state.controls)
        )
            return
        this.#clearLiveQueue()
        const runtime = project.controls.runtimeSnapshot()
        const activation = project.activation
        const stopEpoch = this.#stopEpoch
        this.state.error = null
        this.state.preparing = true
        try {
            await this.#prepareSaved(project, source, activation)
            if (
                project.accepted !== source ||
                packageRevision !== this.packages.readyRevision(project.id) ||
                stopEpoch !== this.#stopEpoch ||
                run.state.trust !== "trusted" ||
                !run.state.desired ||
                !sameRevisions(run.state.desired, {
                    ...runtime,
                    sourceRevision: source.sourceRevision,
                }) ||
                !controlsReady(project.controls.state.controls)
            )
                throw new Error(
                    "Script inputs or controls changed while preparing. Try running again.",
                )
            this.state.owner = project.id
            this.#clearRuntimeMarkers(project)
            await run.run({
                projectId: project.id,
                clientRequestId: crypto.randomUUID() as ClientRequestId,
                source: { ...source, contentHash: "" },
                ...runtime,
            })
        } catch (error) {
            if (this.#isCurrent(project, activation)) this.#report(error)
        } finally {
            this.state.preparing = false
            this.#releaseOwner(project)
            this.#pumpLive()
        }
    }

    #releaseOwner(project: WorkspaceProject): void {
        if (
            this.state.owner === project.id &&
            !this.state.stopPending &&
            !project.run.state.active &&
            !project.run.state.admitting
        )
            this.state.owner = null
    }

    async stop(): Promise<void> {
        const owner = this.getProject(this.state.owner)
        if (owner) await owner.run.stop()
    }

    async dispose(): Promise<void> {
        if (this.#disposed) return
        this.#assertNavigable()
        if (this.state.owner || this.state.preparing)
            throw new Error(
                "Stop the active script and wait for script operations to finish before closing.",
            )
        this.#disableLive()
        clearTimeout(this.#analysisTimer)
        this.state.closing = true
        this.state.error = null
        try {
            // S30 retains its models on a failed flush. Keep every other owner alive for retry.
            await this.projects.dispose()
            this.#disposed = true
            for (const project of this.#contexts.values()) {
                project.run.dispose()
                project.controls.dispose()
                for (const listener of project.listeners) listener.dispose()
                for (const token of project.tokens) this.#revoke(token)
            }
            this.#contexts.clear()
            this.#persisted.clear()
            this.options.analysis.dispose()
            this.packages.dispose()
            this.options.disposeEditor()
        } catch (error) {
            this.#report(error)
            throw error
        } finally {
            this.state.closing = false
        }
    }

    #revoke(token: string): void {
        void this.options.revokeInput(token).catch(() => {})
    }

    #report(error: unknown): void {
        this.state.error = error instanceof Error ? error.message : String(error)
    }
}

function sourceOf(project: WorkspaceProject): CapturedSource {
    return { source: project.model.model.getValue(), sourceRevision: project.model.revision }
}

function matchesSource(project: WorkspaceProject, captured: CapturedSource): boolean {
    return (
        project.model.revision === captured.sourceRevision &&
        project.model.model.getValue() === captured.source
    )
}

function tokenOf(input: SelectedInput): string {
    return input.type === "localFile" ? input.selectionToken : input.resourceId
}

function sameIdentity(a: RunIdentity | null, b: RunIdentity): boolean {
    return Boolean(
        a &&
            a.projectId === b.projectId &&
            a.clientRequestId === b.clientRequestId &&
            a.runId === b.runId &&
            sameRevisions(a, b),
    )
}

function inModel(
    model: Monaco.editor.ITextModel,
    position: { line: number; column: number; offset: number },
): boolean {
    return (
        [position.line, position.column, position.offset].every(Number.isSafeInteger) &&
        position.line > 0 &&
        position.line <= model.getLineCount() &&
        position.column > 0 &&
        position.column <= model.getLineMaxColumn(position.line) &&
        model.getOffsetAt({ lineNumber: position.line, column: position.column }) ===
            position.offset
    )
}
