import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { snapshot } from "valtio/vanilla"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectId, SourceRevision } from "../contracts"
import {
    type EditorMonacoApi,
    ScriptEditorSession,
    ScriptModelRegistry,
} from "../editor/modelRegistry"
import {
    createProjectCommands,
    createProjectEditorBindings,
    type ProjectCommands,
    type StoredProject,
} from "./adapters"
import { ScriptProjectController } from "./controller"
import type { ProjectSession } from "./session"

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
const id = (value: string) => value as ProjectId
const revision = (value: number) => value as SourceRevision
function project(name: string): StoredProject {
    return {
        manifest: {
            schemaVersion: 1,
            projectId: id(name),
            displayName: name,
            entryFile: "process.ts",
        },
        source: `source ${name}`,
    }
}
const view: Monaco.editor.ICodeEditorViewState = {
    cursorState: [
        {
            inSelectionMode: false,
            selectionStart: { lineNumber: 2, column: 3 },
            position: { lineNumber: 2, column: 3 },
        },
    ],
    viewState: {
        scrollLeft: 0,
        firstPosition: { lineNumber: 2, column: 1 },
        firstPositionDeltaTop: 4,
    },
    contributionsState: {},
}
function harness(session: ProjectSession | null = null) {
    const files = new Map([project("a"), project("b")].map((p) => [p.manifest.projectId, p]))
    const models = new Map<string, Monaco.editor.ITextModel>()
    const monaco = {
        Uri: { parse: (value: string) => ({ toString: () => value }) },
        editor: {
            getModel: (uri: Monaco.Uri) => models.get(uri.toString()),
            createModel(source: string, _language: string, uri: Monaco.Uri) {
                let content = source
                let disposed = false
                const listeners = new Set<() => void>()
                const model = {
                    getValue: () => content,
                    setValue(value: string) {
                        content = value
                        for (const listener of listeners) listener()
                    },
                    onDidChangeContent(listener: () => void) {
                        listeners.add(listener)
                        return { dispose: () => listeners.delete(listener) }
                    },
                    dispose() {
                        disposed = true
                        models.delete(uri.toString())
                    },
                    isDisposed: () => disposed,
                } as unknown as Monaco.editor.ITextModel
                models.set(uri.toString(), model)
                return model
            },
            setModelMarkers: vi.fn(),
        },
    } as unknown as EditorMonacoApi
    const registry = new ScriptModelRegistry(monaco, { addExtraLib: () => ({ dispose() {} }) })
    const commands = {
        list: vi.fn(async () => [...files.values()].map((p) => p.manifest)),
        open: vi.fn(async (projectId: ProjectId) =>
            structuredClone(required(files.get(projectId))),
        ),
        create: vi.fn(async (name: string) => {
            const p = project(name)
            files.set(p.manifest.projectId, p)
            return p
        }),
        rename: vi.fn(async (projectId: ProjectId, displayName: string) => {
            const p = required(files.get(projectId))
            p.manifest = { ...p.manifest, displayName }
            return p.manifest
        }),
        save: vi.fn(
            async (projectId: ProjectId, source: string, sourceRevision: SourceRevision) => {
                required(files.get(projectId)).source = source
                return sourceRevision
            },
        ),
    } satisfies ProjectCommands
    let savedSession = session
    let active: ReturnType<typeof registry.open> | undefined
    let viewListener = () => {}
    const editor = {
        activate: vi.fn((handle: ReturnType<typeof registry.open>) => {
            active = handle
        }),
        saveViewState: vi.fn(() => view),
        onDidChangeViewState: vi.fn((listener: () => void) => {
            viewListener = listener
            return { dispose: vi.fn() }
        }),
        clear: vi.fn(),
    }
    const storage = {
        load: vi.fn(() => savedSession),
        save: vi.fn((value: ProjectSession) => {
            savedSession = structuredClone(value)
        }),
    }
    const controller = new ScriptProjectController({
        commands,
        editor,
        session: storage,
        models: {
            open: (p) =>
                registry.open(
                    monaco.Uri.parse(`file:///${p.manifest.projectId}/process.ts`),
                    p.source,
                ),
        },
    })
    return {
        controller,
        commands,
        registry,
        monaco,
        viewChanged: () => viewListener(),
        editor,
        storage,
        files,
        active: () => required(active),
        session: () => savedSession,
    }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("ScriptProjectController", () => {
    it("debounces rapid edits and keeps source out of render/session state", async () => {
        const h = harness()
        await h.controller.open(id("a"))
        h.active().model.setValue("first")
        await vi.advanceTimersByTimeAsync(200)
        h.active().model.setValue("latest")
        await vi.advanceTimersByTimeAsync(299)
        expect(h.commands.save).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(h.commands.save).toHaveBeenCalledExactlyOnceWith(id("a"), "latest", revision(2))
        expect(snapshot(h.controller.state).documents.a).toMatchObject({
            status: "saved",
            dirty: false,
            savedRevision: 2,
        })
        expect(JSON.stringify(snapshot(h.controller.state))).not.toContain("latest")
        expect(JSON.stringify(h.session())).not.toContain("latest")
        await h.controller.dispose()
    })

    it("serializes writes and rejects stale acknowledgements as evidence of newer saves", async () => {
        const h = harness()
        await h.controller.open(id("a"))
        const first = deferred<SourceRevision>()
        const second = deferred<SourceRevision>()
        const entered = deferred<void>()
        h.commands.save
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => {
                entered.resolve()
                return second.promise
            })
        h.active().model.setValue("one")
        await vi.advanceTimersByTimeAsync(300)
        h.active().model.setValue("two")
        h.active().model.setValue("three")
        expect(h.commands.save).toHaveBeenCalledTimes(1)
        first.resolve(revision(1))
        await entered.promise
        expect(h.active().dirty).toBe(true)
        expect(h.controller.state.documents.a).toMatchObject({
            dirty: true,
            status: "saving",
            savedRevision: 1,
            revision: 3,
        })
        expect(h.commands.save).toHaveBeenLastCalledWith(id("a"), "three", revision(3))
        second.resolve(revision(3))
        await h.controller.flush()
        expect(h.controller.state.documents.a).toMatchObject({
            dirty: false,
            status: "saved",
            savedRevision: 3,
        })
        await h.controller.dispose()
    })

    it("keeps failed work in its original model and retries before switching", async () => {
        const h = harness()
        await h.controller.open(id("a"))
        const original = h.active()
        original.model.setValue("unsaved work")
        h.commands.save.mockRejectedValueOnce(new Error("disk full"))
        await expect(h.controller.open(id("b"))).rejects.toThrow("disk full")
        expect(h.controller.state.currentProjectId).toBe("a")
        expect(h.controller.state.documents.a).toMatchObject({
            status: "save-error",
            dirty: true,
            error: "disk full",
        })
        expect(original.model.getValue()).toBe("unsaved work")
        expect(h.commands.open).not.toHaveBeenCalledWith(id("b"))
        await h.controller.open(id("b"))
        expect(h.files.get(id("a"))?.source).toBe("unsaved work")
        await h.controller.open(id("a"))
        expect(h.active()).toBe(original)
        expect(h.editor.activate).toHaveBeenLastCalledWith(original, view)
        await h.controller.dispose()
    })

    it("does not mark a mismatched save acknowledgement clean and recovers from synchronous failures", async () => {
        const h = harness()
        await h.controller.open(id("a"))
        h.active().model.setValue("changed")
        h.commands.save.mockResolvedValueOnce(revision(99))
        await expect(h.controller.flush()).rejects.toThrow("revision mismatch")
        expect(h.active().dirty).toBe(true)
        h.commands.save.mockImplementationOnce(() => {
            throw new Error("invoke unavailable")
        })
        await expect(h.controller.flush()).rejects.toThrow("invoke unavailable")
        await h.controller.flush()
        expect(h.active().dirty).toBe(false)
        await h.controller.dispose()
    })

    it("restores the last project and view without a run adapter or source rewrite", async () => {
        const h = harness({ schemaVersion: 1, lastProjectId: id("b"), views: { b: view } })
        await h.controller.initialize()
        expect(h.controller.state.currentProjectId).toBe("b")
        expect(h.active().model.getValue()).toBe("source b")
        expect(h.active().revision).toBe(0)
        expect(h.editor.activate).toHaveBeenCalledWith(h.active(), view)
        expect(h.commands.save).not.toHaveBeenCalled()
        await h.controller.dispose()
        const reload = harness(h.session())
        await reload.controller.initialize()
        expect(reload.controller.state.currentProjectId).toBe("b")
        expect(reload.active().model.getValue()).toBe("source b")
        expect(reload.commands.save).not.toHaveBeenCalled()
        await reload.controller.dispose()
    })

    it("keeps the newest navigation when older opens complete late", async () => {
        const h = harness()
        const pending = deferred<StoredProject>()
        const entered = deferred<void>()
        h.commands.open.mockImplementationOnce(() => {
            entered.resolve()
            return pending.promise
        })
        const older = h.controller.open(id("a"))
        await entered.promise
        await h.controller.open(id("b"))
        pending.resolve(project("a"))
        await older
        expect(h.controller.state.currentProjectId).toBe("b")
        expect(h.active().model.getValue()).toBe("source b")
        await h.controller.dispose()
    })

    it("creates/lists projects and serializes rename persistence", async () => {
        const h = harness()
        await h.controller.initialize()
        expect(h.controller.state.projects).toHaveLength(2)
        await h.controller.create("new")
        expect(h.controller.state.currentProjectId).toBe("new")
        const first = h.controller.rename(id("new"), "first")
        const second = h.controller.rename(id("new"), "second")
        await Promise.all([first, second])
        expect(h.controller.state.projects.find((p) => p.projectId === "new")?.displayName).toBe(
            "second",
        )
        expect(h.files.get(id("new"))?.manifest.displayName).toBe("second")
        await h.controller.dispose()
    })

    it("retains models on failed teardown and flushes before successful disposal", async () => {
        const h = harness()
        await h.controller.open(id("a"))
        const handle = h.active()
        handle.model.setValue("recovery")
        h.commands.save.mockRejectedValueOnce(new Error("offline"))
        await expect(h.controller.dispose()).rejects.toThrow("offline")
        expect(handle.model.isDisposed()).toBe(false)
        expect(h.editor.clear).not.toHaveBeenCalled()
        await h.controller.dispose()
        expect(h.files.get(id("a"))?.source).toBe("recovery")
        expect(handle.model.isDisposed()).toBe(true)
        await vi.runAllTimersAsync()
        expect(h.commands.save).toHaveBeenCalledTimes(2)
    })

    it("isolates session storage failures from source saves", async () => {
        const h = harness()
        h.storage.load.mockImplementation(() => {
            throw new Error("blocked")
        })
        h.storage.save.mockImplementation(() => {
            throw new Error("quota exceeded")
        })
        await h.controller.initialize()
        await h.controller.open(id("a"))
        expect(h.controller.state.sessionError).toBe("quota exceeded")
        h.active().model.setValue("durable source")
        await h.controller.flush()
        expect(h.files.get(id("a"))?.source).toBe("durable source")
        await h.controller.dispose()
    })
})

it("uses the service-aware save command without exposing an execution command", async () => {
    const invoke = vi.fn(async (_command: string, _args?: Record<string, unknown>) => revision(7))
    const commands = createProjectCommands(
        <T>(command: string, args?: Record<string, unknown>) => invoke(command, args) as Promise<T>,
    )
    await commands.save(id("a"), "source", revision(7))
    expect(invoke).toHaveBeenCalledExactlyOnceWith("save_trusted_script_project", {
        projectId: "a",
        source: "source",
        sourceRevision: 7,
    })
})

function required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error("Missing test fixture")
    return value
}

it("does not let slow initialization undo user selection or a newly created project", async () => {
    const h = harness({ schemaVersion: 1, lastProjectId: id("a"), views: {} })
    const listing = deferred<ReturnType<typeof project>["manifest"][]>()
    h.commands.list.mockReturnValueOnce(listing.promise)
    const initialize = h.controller.initialize()
    await h.controller.create("new")
    listing.resolve([project("a").manifest, project("b").manifest])
    await initialize
    expect(h.controller.state.currentProjectId).toBe("new")
    expect(h.controller.state.projects.map((p) => p.projectId)).toContain("new")
    await h.controller.dispose()
})

it("shows initialization/rename failures and permits retry", async () => {
    const h = harness()
    h.commands.list.mockRejectedValueOnce(new Error("list unavailable"))
    await expect(h.controller.initialize()).rejects.toThrow("list unavailable")
    expect(h.controller.state).toMatchObject({ loading: false, error: "list unavailable" })
    await h.controller.initialize()
    h.commands.rename.mockRejectedValueOnce(new Error("rename unavailable"))
    await expect(h.controller.rename(id("a"), "name")).rejects.toThrow("rename unavailable")
    expect(h.controller.state.error).toBe("rename unavailable")
    await h.controller.rename(id("a"), "name")
    expect(h.controller.state.error).toBeNull()
    await h.controller.dispose()
})

it("persists current cursor/scroll changes without waiting for a project switch", async () => {
    const h = harness()
    await h.controller.open(id("a"))
    const changed = { ...view, viewState: { ...view.viewState, scrollLeft: 42 } }
    h.editor.saveViewState.mockReturnValue(changed)
    h.viewChanged()
    await vi.advanceTimersByTimeAsync(250)
    expect(h.session()?.views.a).toEqual(changed)
    expect(h.commands.save).not.toHaveBeenCalled()
    await h.controller.dispose()
})

it("composes the existing model registry/editor session and disposes view subscriptions", () => {
    const h = harness()
    const scrollDispose = vi.fn()
    const cursorDispose = vi.fn()
    const editor = {
        setModel: vi.fn(),
        saveViewState: vi.fn(() => view),
        restoreViewState: vi.fn(),
        focus: vi.fn(),
        dispose: vi.fn(),
        onDidScrollChange: vi.fn(() => ({ dispose: scrollDispose })),
        onDidChangeCursorPosition: vi.fn(() => ({ dispose: cursorDispose })),
    }
    const session = new ScriptEditorSession(
        editor as unknown as Monaco.editor.IStandaloneCodeEditor,
    )
    const bindings = createProjectEditorBindings(h.registry, session, h.monaco.Uri)
    const a = bindings.models.open(project("a"))
    const b = bindings.models.open(project("b"))
    bindings.editor.activate(a, view)
    bindings.editor.activate(b)
    bindings.editor.activate(a)
    expect(bindings.models.open(project("a"))).toBe(a)
    expect(editor.setModel.mock.calls.map(([model]) => model)).toEqual([a.model, b.model, a.model])
    expect(editor.restoreViewState).toHaveBeenCalledWith(view)
    expect(bindings.editor.saveViewState()).toEqual(view)
    const listener = vi.fn()
    bindings.editor.onDidChangeViewState(listener).dispose()
    expect(scrollDispose).toHaveBeenCalledOnce()
    expect(cursorDispose).toHaveBeenCalledOnce()
    bindings.editor.clear()
    expect(editor.setModel).toHaveBeenLastCalledWith(null)
    h.registry.dispose()
    session.dispose()
})
