import type * as Monaco from "monaco-editor/editor/editor.api.js"
import type { ScriptDiagnostic, SourceRevision } from "../contracts"
import { registerDtmDeclarations } from "./dtmDeclarations"

export const EDITOR_MARKER_OWNERS = {
    analyzer: "dtm-script-analyzer",
    runtime: "dtm-script-runtime",
} as const

export type EditorMarkerOwner = (typeof EDITOR_MARKER_OWNERS)[keyof typeof EDITOR_MARKER_OWNERS]

export interface EditorMonacoApi {
    Uri: typeof Monaco.Uri
    editor: typeof Monaco.editor
}

export interface ModelRevisionEvent {
    revision: SourceRevision
    dirty: boolean
}

export interface ScriptProjectModel extends Monaco.IDisposable {
    readonly uri: Monaco.Uri
    readonly model: Monaco.editor.ITextModel
    readonly revision: SourceRevision
    readonly dirty: boolean
    readonly diagnostics: readonly ScriptDiagnostic[]
    onDidChangeRevision(listener: (event: ModelRevisionEvent) => void): Monaco.IDisposable
    markSaved(revision?: SourceRevision): boolean
    setDiagnostics(
        owner: EditorMarkerOwner,
        diagnostics: readonly ScriptDiagnostic[],
        markers?: readonly Monaco.editor.IMarkerData[],
    ): void
    addProvider(provider: Monaco.IDisposable): Monaco.IDisposable
}

interface ProjectRecord {
    handle: ScriptProjectModel
    providers: Set<Monaco.IDisposable>
    diagnostics: Map<EditorMarkerOwner, readonly ScriptDiagnostic[]>
    revisionListeners: Set<(event: ModelRevisionEvent) => void>
    revision: number
    savedRevision: number
    disposed: boolean
    contentSubscription: Monaco.IDisposable
}

/** Owns Monaco resources for one editor-package lifecycle. Source stays in Monaco models. */
export class ScriptModelRegistry implements Monaco.IDisposable {
    readonly #projects = new Map<string, ProjectRecord>()
    readonly #declarations: Monaco.IDisposable
    #disposed = false

    constructor(
        private readonly monaco: EditorMonacoApi,
        typescriptDefaults: Parameters<typeof registerDtmDeclarations>[0],
    ) {
        this.#declarations = registerDtmDeclarations(typescriptDefaults)
    }

    open(uri: Monaco.Uri, source: string): ScriptProjectModel {
        this.#assertActive()
        const key = uri.toString()
        const current = this.#projects.get(key)
        if (current) return current.handle

        const existing = this.monaco.editor.getModel(uri)
        if (existing) {
            throw new Error(`Monaco model URI is already owned outside this registry: ${key}`)
        }

        const model = this.monaco.editor.createModel(source, "typescript", uri)
        const providers = new Set<Monaco.IDisposable>()
        const diagnostics = new Map<EditorMarkerOwner, readonly ScriptDiagnostic[]>()
        const revisionListeners = new Set<(event: ModelRevisionEvent) => void>()
        const record = {} as ProjectRecord

        const handle: ScriptProjectModel = {
            uri,
            model,
            get revision() {
                return record.revision as SourceRevision
            },
            get dirty() {
                return record.revision !== record.savedRevision
            },
            get diagnostics() {
                return [...diagnostics.values()].flat()
            },
            onDidChangeRevision(listener) {
                if (record.disposed) throw new Error("Script project model has been disposed")
                revisionListeners.add(listener)
                return { dispose: () => revisionListeners.delete(listener) }
            },
            markSaved(revision = record.revision as SourceRevision) {
                if (record.disposed) return false
                if (revision !== record.revision) return false
                record.savedRevision = revision
                return true
            },
            setDiagnostics: (owner, nextDiagnostics, markers = []) => {
                if (record.disposed) throw new Error("Script project model has been disposed")
                diagnostics.set(owner, [...nextDiagnostics])
                this.monaco.editor.setModelMarkers(model, owner, [...markers])
            },
            addProvider(provider) {
                if (record.disposed) {
                    provider.dispose()
                    throw new Error("Script project model has been disposed")
                }
                providers.add(provider)
                return {
                    dispose() {
                        if (providers.delete(provider)) provider.dispose()
                    },
                }
            },
            dispose: () => this.#disposeRecord(record),
        }

        record.handle = handle
        record.providers = providers
        record.diagnostics = diagnostics
        record.revisionListeners = revisionListeners
        record.revision = 0
        record.savedRevision = 0
        record.disposed = false
        record.contentSubscription = model.onDidChangeContent(() => {
            record.revision += 1
            const event = {
                revision: record.revision as SourceRevision,
                dirty: record.revision !== record.savedRevision,
            }
            for (const listener of [...revisionListeners]) listener(event)
        })
        this.#projects.set(key, record)
        return handle
    }

    get(uri: Monaco.Uri): ScriptProjectModel | undefined {
        return this.#projects.get(uri.toString())?.handle
    }

    disposeProject(uri: Monaco.Uri): void {
        const record = this.#projects.get(uri.toString())
        if (!record) return
        this.#disposeRecord(record)
    }

    #disposeRecord(record: ProjectRecord): void {
        if (record.disposed) return
        record.disposed = true
        const key = record.handle.uri.toString()
        if (this.#projects.get(key) === record) this.#projects.delete(key)
        record.contentSubscription.dispose()
        for (const provider of record.providers) provider.dispose()
        record.providers.clear()
        for (const owner of Object.values(EDITOR_MARKER_OWNERS)) {
            this.monaco.editor.setModelMarkers(record.handle.model, owner, [])
        }
        record.revisionListeners.clear()
        record.handle.model.dispose()
    }

    dispose(): void {
        if (this.#disposed) return
        this.#disposed = true
        for (const record of [...this.#projects.values()]) this.#disposeRecord(record)
        this.#declarations.dispose()
    }

    #assertActive(): void {
        if (this.#disposed) throw new Error("ScriptModelRegistry has been disposed")
    }
}

/** Switches models while retaining each project's independent Monaco view state and undo stack. */
export class ScriptEditorSession implements Monaco.IDisposable {
    readonly #viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>()
    #active: ScriptProjectModel | undefined

    constructor(readonly editor: Monaco.editor.IStandaloneCodeEditor) {}

    switchTo(project: ScriptProjectModel): void {
        if (this.#active === project) return
        if (this.#active) {
            this.#viewStates.set(this.#active.uri.toString(), this.editor.saveViewState())
        }
        this.#active = project
        this.editor.setModel(project.model)
        const state = this.#viewStates.get(project.uri.toString())
        if (state) this.editor.restoreViewState(state)
        this.editor.focus()
    }

    dispose(): void {
        this.#viewStates.clear()
        this.#active = undefined
        this.editor.dispose()
    }
}
