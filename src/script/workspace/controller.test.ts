import { describe, expect, it, vi } from "vitest"
import { analyzeScript } from "../analysis"
import type {
    ProjectId,
    RunId,
    RunIdentity,
    RunRequest,
    ScriptDiagnostic,
    ScriptRunEvent,
    SelectedInput,
} from "../contracts"
import { deferred, harness, script } from "../controls/testHelpers"
import { EDITOR_MARKER_OWNERS } from "../editor/modelRegistry"
import type { ProjectCommands, StoredProject } from "../project"
import { ScriptWorkspaceController } from "./controller"

const ids = ["one" as ProjectId, "two" as ProjectId]
const body = "return new Uint8Array()"

function setup(selectImage = vi.fn(async (): Promise<SelectedInput | null> => null)) {
    const stored = new Map(
        ids.map((id) => [
            id,
            {
                manifest: {
                    schemaVersion: 1,
                    displayName: id,
                    entryFile: "process.ts",
                    projectId: id,
                },
                source: script(body),
            } satisfies StoredProject,
        ]),
    )
    const save = vi.fn<ProjectCommands["save"]>(async (id, source, revision) => {
        const existing = stored.get(id)
        if (!existing) throw new Error("missing project")
        stored.set(id, { ...existing, source })
        return revision
    })
    const analysis = { analyze: vi.fn(async (request) => analyzeScript(request)), dispose: vi.fn() }
    const models = new Map<ProjectId, ReturnType<typeof harness>>()
    const listeners = new Set<(event: ScriptRunEvent) => unknown>()
    const emit = (event: ScriptRunEvent) => {
        for (const listener of listeners) listener(event)
    }
    const subscribe = vi.fn(async (listener: (event: ScriptRunEvent) => unknown) => {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    })
    let identity: RunIdentity | undefined
    let nextRun = 0
    const run = vi.fn(async (request: RunRequest) => {
        if (identity) emit({ type: "cancelled", identity, reason: "superseded" })
        identity = {
            projectId: request.projectId,
            runId: `backend-run-${++nextRun}` as RunId,
            clientRequestId: request.clientRequestId,
            sourceRevision: request.source.sourceRevision,
            valueRevision: request.valueRevision,
            inputRevision: request.inputRevision,
        }
        emit({ type: "queued", identity })
        emit({ type: "started", identity, startedAt: "test" })
        return identity
    })
    const stop = vi.fn(async () => {
        if (identity) emit({ type: "cancelled", identity, reason: "user" })
    })
    const trust = vi.fn(async () => {})
    const disposeEditor = vi.fn()
    const revokeInput = vi.fn(async (_: string) => {})
    const editor = {
        activate: vi.fn(),
        onDidChangeViewState: () => ({ dispose() {} }),
        saveViewState: () => null,
        clear: vi.fn(),
    }
    const workspace = new ScriptWorkspaceController({
        commands: {
            save,
            open: async (id) => {
                const project = stored.get(id)
                if (!project) throw new Error("missing project")
                return project
            },
            list: async () => [...stored.values()].map(({ manifest }) => manifest),
            create: async () => {
                throw new Error("unused")
            },
            rename: async () => {
                throw new Error("unused")
            },
        },
        models: {
            open({ manifest }) {
                const item = harness(body, { id: manifest.projectId })
                const model = item.project.model
                Object.assign(model, {
                    getLineCount: () => model.getValue().split("\n").length,
                    getLineMaxColumn: (line: number) =>
                        model.getValue().split("\n")[line - 1].length + 1,
                    getOffsetAt: ({ lineNumber, column }: { lineNumber: number; column: number }) =>
                        model
                            .getValue()
                            .split("\n")
                            .slice(0, lineNumber - 1)
                            .reduce((n, line) => n + line.length + 1, column - 1),
                })
                models.set(manifest.projectId, item)
                return item.project
            },
        },
        editor,
        analysis,
        events: { subscribe },
        run: { run, trust, stop },
        session: {
            load: () => ({ schemaVersion: 1, lastProjectId: ids[0], views: {} }),
            save() {},
        },
        autosaveDelay: 60_000,
        selectImage,
        revokeInput,
        disposeEditor,
    })
    return {
        workspace,
        stored,
        save,
        analysis,
        models,
        editor,
        run,
        trust,
        stop,
        emit,
        revokeInput,
        disposeEditor,
        subscribe,
    }
}

describe("Image Scripts workspace", () => {
    it("restores without trusting or running and retains a failed-save model for switch and close retry", async () => {
        const h = setup()
        const { workspace } = h
        await workspace.projects.initialize()
        const original = workspace.getProject(ids[0])
        expect(original?.run.state.trust).toBe("untrusted")
        expect(h.run).not.toHaveBeenCalled()
        expect(h.trust).not.toHaveBeenCalled()
        const edited = script("return 'edited'")
        original?.model.model.setValue(edited)
        h.save.mockRejectedValue(new Error("disk full"))

        await expect(workspace.open(ids[1])).rejects.toThrow("disk full")
        expect(workspace.projects.state.currentProjectId).toBe(ids[0])
        await expect(workspace.dispose()).rejects.toThrow("disk full")
        expect(original?.model.model.getValue()).toBe(edited)
        expect(original?.model.model.isDisposed()).toBe(false)
        expect(h.analysis.dispose).not.toHaveBeenCalled()
        expect(h.disposeEditor).not.toHaveBeenCalled()

        h.save.mockImplementation(async (id, source, revision) => {
            const stored = h.stored.get(id)
            if (!stored) throw new Error("missing project")
            h.stored.set(id, { ...stored, source })
            return revision
        })
        await workspace.open(ids[1])
        expect(h.stored.get(ids[0])?.source).toBe(edited)
        await workspace.dispose()
        expect(original?.model.model.isDisposed()).toBe(true)
        expect(h.analysis.dispose).toHaveBeenCalledOnce()
        expect(h.disposeEditor).toHaveBeenCalledOnce()
    })

    it("submits only an accepted saved snapshot and suppresses stale or rejected runtime markers", async () => {
        const h = setup()
        const { workspace } = h
        await workspace.projects.initialize()
        const project = workspace.getProject(ids[0])
        if (!project) throw new Error("Missing restored project")
        const initial = script("throw new Error('oops')")
        project.model.model.setValue(initial)
        await workspace.analyzeCurrent()
        expect(await project.run.trust(true)).toBe(true)
        await workspace.run(project)
        const [request] = h.run.mock.calls[0]
        expect(request.source.source).toBe(initial)
        expect(h.stored.get(ids[0])?.source).toBe(initial)

        const identity = project.run.state.identity
        if (!identity) throw new Error("Missing run identity")
        const diagnostic: ScriptDiagnostic = {
            source: "userRuntime",
            severity: "error",
            message: "oops",
            location: {
                file: project.model.uri.toString(),
                range: {
                    start: { line: 1, column: 1, offset: 0 },
                    end: { line: 1, column: 2, offset: 1 },
                },
            },
        }
        const markers = h.models.get(ids[0])?.monaco.editor.setModelMarkers
        h.emit({
            type: "diagnostic",
            identity: { ...identity, runId: "other" as RunId },
            diagnostic,
        })
        expect(markers).not.toHaveBeenCalledWith(
            project.model.model,
            EDITOR_MARKER_OWNERS.runtime,
            expect.arrayContaining([expect.objectContaining({ message: "oops" })]),
        )
        h.emit({ type: "diagnostic", identity, diagnostic })
        expect(markers).toHaveBeenCalledWith(
            project.model.model,
            EDITOR_MARKER_OWNERS.runtime,
            expect.arrayContaining([expect.objectContaining({ message: "oops" })]),
        )

        await workspace.stop()
        h.emit({ type: "diagnostic", identity, diagnostic: { ...diagnostic, message: "late" } })
        expect(markers).not.toHaveBeenCalledWith(
            project.model.model,
            EDITOR_MARKER_OWNERS.runtime,
            expect.arrayContaining([expect.objectContaining({ message: "late" })]),
        )
        project.model.model.setValue(script(body))
        expect(markers).toHaveBeenLastCalledWith(
            project.model.model,
            EDITOR_MARKER_OWNERS.analyzer,
            [],
        )
        expect(project.state.analysisReady).toBe(false)
        await workspace.dispose()
    })

    it("revokes a picker result that arrives after navigating to another project", async () => {
        const choice = deferred<SelectedInput>()
        const h = setup(vi.fn(() => choice.promise))
        const { workspace } = h
        await workspace.open(ids[0])
        const original = workspace.getProject(ids[0])
        if (!original) throw new Error("Missing project")
        original.model.model.setValue(script("return dtm.input({ id: 'sample' })"))
        await workspace.analyzeCurrent()
        const picking = original.controls.selectImage("sample")
        await workspace.open(ids[1])
        choice.resolve({
            type: "localFile",
            inputId: "sample",
            displayName: "file.png",
            selectionToken: "late",
        })
        await picking
        expect(h.revokeInput).toHaveBeenCalledWith("late")
        expect(original.controls.runtimeSnapshot().inputs).toEqual([])
        await workspace.dispose()
    })
})

describe("live scheduling and global run ownership", () => {
    it("debounces typing and leaves the active run intact through invalid source", async () => {
        vi.useFakeTimers()
        const h = setup()
        const { workspace } = h
        try {
            await workspace.projects.initialize()
            const project = workspace.getProject(ids[0])
            if (!project) throw new Error("Missing project")
            await workspace.analyzeCurrent()
            expect(await project.run.trust(true)).toBe(true)
            workspace.setLive(true)
            await vi.advanceTimersByTimeAsync(0)
            expect(h.run).toHaveBeenCalledTimes(1)

            project.model.model.setValue(script("const value ="))
            await vi.advanceTimersByTimeAsync(180)
            expect(project.controls.state.analysisStatus).toBe("invalid")
            expect(h.run).toHaveBeenCalledTimes(1)
            expect(h.stop).not.toHaveBeenCalled()
            expect(project.run.state.active).toBe(true)

            project.model.model.setValue(script("return 'a'"))
            await vi.advanceTimersByTimeAsync(50)
            project.model.model.setValue(script("return 'ab'"))
            await vi.advanceTimersByTimeAsync(50)
            const finalSource = script("return 'abc'")
            project.model.model.setValue(finalSource)
            await vi.advanceTimersByTimeAsync(179)
            expect(h.run).toHaveBeenCalledTimes(1)
            await vi.advanceTimersByTimeAsync(1)
            expect(h.run).toHaveBeenCalledTimes(2)
            expect(h.run.mock.calls.at(-1)?.[0].source.source).toBe(finalSource)
            expect(h.stop).not.toHaveBeenCalled()
            await workspace.stop()
            await workspace.dispose()
        } finally {
            vi.useRealTimers()
        }
    })

    it("runs a slider commit immediately and blocks invalid numeric draft replacements", async () => {
        vi.useFakeTimers()
        const h = setup()
        const { workspace } = h
        try {
            await workspace.projects.initialize()
            const project = workspace.getProject(ids[0])
            if (!project) throw new Error("Missing project")
            project.model.model.setValue(
                script(
                    "dtm.param(0, { id: 'slider', min: 0, max: 10, step: 1 }); dtm.param(2, { id: 'number' }); return 'image'",
                ),
            )
            await workspace.analyzeCurrent()
            expect(await project.run.trust(true)).toBe(true)
            workspace.setLive(true)
            await vi.advanceTimersByTimeAsync(0)
            expect(h.run).toHaveBeenCalledTimes(1)
            const previous = project.run.state.identity
            if (!previous) throw new Error("Missing first run")

            project.controls.setValue("slider", { type: "number", value: 3 })
            project.controls.setValue("slider", { type: "number", value: 4 })
            h.emit({
                type: "succeeded",
                identity: previous,
                output: {
                    previewUrl: `dtm://script-output/${"a".repeat(64)}`,
                    mediaType: "image/png",
                    byteLength: 1,
                },
            })
            expect(project.run.state.preview).toBeNull()
            await vi.advanceTimersByTimeAsync(179)
            expect(h.run).toHaveBeenCalledTimes(1)
            project.controls.commitValue()
            await vi.advanceTimersByTimeAsync(0)
            expect(h.run).toHaveBeenCalledTimes(2)
            expect(h.run.mock.calls.at(-1)?.[0].values.slider.value).toBe(4)

            project.controls.editNumber("number", "-")
            await vi.advanceTimersByTimeAsync(180)
            expect(project.controls.runtimeSnapshot().values.number.value).toBe(2)
            expect(h.run).toHaveBeenCalledTimes(2)
            project.controls.editNumber("number", "3")
            await vi.advanceTimersByTimeAsync(180)
            expect(h.run).toHaveBeenCalledTimes(3)
            expect(h.run.mock.calls.at(-1)?.[0].values.number.value).toBe(3)
            await workspace.stop()
            await workspace.dispose()
        } finally {
            vi.useRealTimers()
        }
    })

    it("holds global ownership through a delayed Stop acknowledgement and drops late success", async () => {
        const h = setup()
        const { workspace } = h
        await workspace.projects.initialize()
        const first = workspace.getProject(ids[0])
        if (!first) throw new Error("Missing first project")
        await workspace.analyzeCurrent()
        expect(await first.run.trust(true)).toBe(true)
        await workspace.run(first)
        const identity = first.run.state.identity
        if (!identity) throw new Error("Missing first run")
        const acknowledgement = deferred<void>()
        h.stop.mockImplementationOnce(() => acknowledgement.promise)

        const stopping = workspace.stop()
        expect(workspace.state.stopPending).toBe(true)
        h.emit({
            type: "succeeded",
            identity,
            output: {
                previewUrl: `dtm://script-output/${"a".repeat(64)}`,
                mediaType: "image/png",
                byteLength: 1,
            },
        })
        expect(first.run.state.preview).toBeNull()
        expect(first.run.state.phase).toBe("cancelled")
        await workspace.open(ids[1])
        const second = workspace.getProject(ids[1])
        if (!second) throw new Error("Missing second project")
        await workspace.analyzeCurrent()
        expect(await second.run.trust(true)).toBe(true)
        await workspace.run(second)
        expect(h.run).toHaveBeenCalledTimes(1)
        acknowledgement.resolve()
        await stopping
        await workspace.run(second)
        expect(h.run).toHaveBeenCalledTimes(2)
        expect(workspace.state.owner).toBe(ids[1])
        expect(await first.run.stop()).toBe(false)
        expect(h.stop).toHaveBeenCalledTimes(1)
        await workspace.stop()
        await workspace.dispose()
    })

    it("ignores old trust acknowledgements after project switching", async () => {
        const h = setup()
        const { workspace } = h
        await workspace.projects.initialize()
        const first = workspace.getProject(ids[0])
        if (!first) throw new Error("Missing first project")
        const entered = deferred<void>()
        const acknowledgement = deferred<void>()
        h.trust.mockImplementationOnce(() => {
            entered.resolve()
            return acknowledgement.promise
        })
        const approval = first.run.trust(true)
        await entered.promise
        await workspace.open(ids[1])
        acknowledgement.resolve()
        expect(await approval).toBe(false)
        expect(first.run.state.trust).toBe("untrusted")
        expect(workspace.getProject(ids[1])?.run.state.trust).toBe("untrusted")
        expect(workspace.state.live).toBe(false)
        expect(h.run).not.toHaveBeenCalled()
        await workspace.dispose()
    })
})

it("coalesces live replacements while the prior command admission is pending", async () => {
    vi.useFakeTimers()
    const h = setup()
    const { workspace } = h
    try {
        await workspace.projects.initialize()
        const project = workspace.getProject(ids[0])
        if (!project) throw new Error("Missing project")
        project.model.model.setValue(script("dtm.param(0, { id: 'value' }); return 'image'"))
        await workspace.analyzeCurrent()
        expect(await project.run.trust(true)).toBe(true)
        const ack = deferred<void>()
        const perform = h.run.getMockImplementation()
        if (!perform) throw new Error("Missing run implementation")
        h.run.mockImplementationOnce(async (request) => {
            const identity = await perform(request)
            await ack.promise
            return identity
        })

        workspace.setLive(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(project.run.state.admitting).toBe(true)
        project.controls.setValue("value", { type: "number", value: 1 })
        project.controls.commitValue()
        project.controls.setValue("value", { type: "number", value: 2 })
        project.controls.commitValue()
        expect(h.run).toHaveBeenCalledTimes(1)
        ack.resolve()
        await vi.advanceTimersByTimeAsync(0)
        expect(h.run).toHaveBeenCalledTimes(2)
        expect(h.run.mock.calls[1][0].values.value.value).toBe(2)
        await workspace.stop()
        await workspace.dispose()
    } finally {
        vi.useRealTimers()
    }
})

it("does not submit the old project after switching during event subscription", async () => {
    const h = setup()
    const { workspace } = h
    await workspace.projects.initialize()
    const first = workspace.getProject(ids[0])
    if (!first) throw new Error("Missing project")
    await workspace.analyzeCurrent()
    expect(await first.run.trust(true)).toBe(true)
    const entered = deferred<void>()
    const subscribed = deferred<void>()
    const perform = h.subscribe.getMockImplementation()
    if (!perform) throw new Error("Missing subscription implementation")
    h.subscribe.mockImplementationOnce(async (listener) => {
        entered.resolve()
        await subscribed.promise
        return perform(listener)
    })

    const running = workspace.run(first)
    await entered.promise
    await workspace.open(ids[1])
    subscribed.resolve()
    await running
    expect(h.run).not.toHaveBeenCalled()
    expect(workspace.state.owner).toBeNull()
    const second = workspace.getProject(ids[1])
    if (!second) throw new Error("Missing second project")
    await workspace.analyzeCurrent()
    expect(await second.run.trust(true)).toBe(true)
    await workspace.run(second)
    expect(h.run.mock.calls[0][0].projectId).toBe(ids[1])
    await workspace.stop()
    await workspace.dispose()
})

it("does not restart Live when source analysis started before Stop finishes later", async () => {
    vi.useFakeTimers()
    const h = setup()
    const { workspace } = h
    try {
        await workspace.projects.initialize()
        const project = workspace.getProject(ids[0])
        if (!project) throw new Error("Missing project")
        await workspace.analyzeCurrent()
        expect(await project.run.trust(true)).toBe(true)
        workspace.setLive(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(h.run).toHaveBeenCalledTimes(1)

        const result = deferred<ReturnType<typeof analyzeScript>>()
        h.analysis.analyze.mockImplementationOnce(() => result.promise)
        const source = script("return 'new'")
        project.model.model.setValue(source)
        await vi.advanceTimersByTimeAsync(180)
        expect(project.state.analysisReady).toBe(false)

        await workspace.stop()
        expect(workspace.state.live).toBe(false)
        result.resolve(
            analyzeScript({
                source,
                sourceRevision: project.model.revision,
                fileName: project.model.uri.toString(),
            }),
        )
        await vi.advanceTimersByTimeAsync(0)
        expect(project.state.analysisReady).toBe(true)
        expect(h.run).toHaveBeenCalledTimes(1)
        await workspace.dispose()
    } finally {
        vi.useRealTimers()
    }
})

it("keeps Stop routed to the surviving run when a replacement fails before acknowledgement", async () => {
    const h = setup()
    const { workspace } = h
    await workspace.projects.initialize()
    const project = workspace.getProject(ids[0])
    if (!project) throw new Error("Missing project")
    await workspace.analyzeCurrent()
    expect(await project.run.trust(true)).toBe(true)
    await workspace.run(project)
    const previous = project.run.state.identity
    if (!previous) throw new Error("Missing first run")
    const diagnostic: ScriptDiagnostic = {
        source: "runner",
        severity: "error",
        message: "Input preparation failed",
    }
    h.run.mockImplementationOnce(async (request) => {
        const identity: RunIdentity = {
            ...previous,
            runId: "replacement" as RunId,
            clientRequestId: request.clientRequestId,
            sourceRevision: request.source.sourceRevision,
        }
        h.emit({ type: "queued", identity })
        h.emit({ type: "diagnostic", identity, diagnostic })
        h.emit({ type: "failed", identity, diagnostic })
        throw new Error("Admission rejected after terminal event")
    })
    await workspace.run(project)
    expect(project.run.state.phase).toBe("failed")
    expect(project.run.state.active).toBe(true)
    expect(project.run.state.runtimeProblems).toEqual([diagnostic])
    expect(workspace.state.owner).toBe(project.id)
    expect(h.stop).not.toHaveBeenCalled()
    await workspace.stop()
    expect(h.stop).toHaveBeenCalledOnce()
    expect(project.run.state.active).toBe(false)
    await workspace.dispose()
})
