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
    let identity: RunIdentity | undefined
    const run = vi.fn(async (request: RunRequest) => {
        identity = {
            projectId: request.projectId,
            runId: "backend-run" as RunId,
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
        events: {
            subscribe: async (listener) => {
                listeners.add(listener)
                return () => listeners.delete(listener)
            },
        },
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
