import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { describe, expect, it, vi } from "vitest"
import { type EditorMonacoApi, ScriptEditorSession, ScriptModelRegistry } from "./modelRegistry"

function createMonaco() {
    const models = new Map<string, FakeModel>()
    const declarationDispose = vi.fn()
    const addExtraLib = vi.fn(() => ({ dispose: declarationDispose }))
    const setModelMarkers = vi.fn()

    class FakeModel {
        #value: string
        #disposed = false
        #listeners = new Set<() => void>()
        #undo: string[] = []

        constructor(
            value: string,
            readonly uri: Monaco.Uri,
        ) {
            this.#value = value
        }
        getValue() {
            return this.#value
        }
        setValue(value: string) {
            this.#undo.push(this.#value)
            this.#value = value
            this.#emit()
        }
        pushEditOperations(_before: unknown, edits: Array<{ text: string }>) {
            this.setValue(edits[0].text)
            return null
        }
        undo() {
            const value = this.#undo.pop()
            if (value !== undefined) {
                this.#value = value
                this.#emit()
            }
        }
        getFullModelRange() {
            return {}
        }
        onDidChangeContent(listener: () => void) {
            this.#listeners.add(listener)
            return { dispose: () => this.#listeners.delete(listener) }
        }
        dispose() {
            this.#disposed = true
            models.delete(this.uri.toString())
        }
        isDisposed() {
            return this.#disposed
        }
        #emit() {
            for (const listener of this.#listeners) listener()
        }
    }

    const monaco = {
        Uri: { parse: (value: string) => ({ toString: () => value }) },
        languages: { typescript: { typescriptDefaults: { addExtraLib } } },
        editor: {
            getModel: (uri: Monaco.Uri) => models.get(uri.toString()) ?? null,
            createModel: (source: string, _language: string, uri: Monaco.Uri) => {
                const model = new FakeModel(source, uri)
                models.set(uri.toString(), model)
                return model
            },
            setModelMarkers,
        },
    } as unknown as EditorMonacoApi

    return { monaco, addExtraLib, declarationDispose, setModelMarkers }
}

function uri(monaco: EditorMonacoApi, name: string) {
    return monaco.Uri.parse(`file:///dtm/projects/${name}/process.ts`)
}

describe("ScriptModelRegistry", () => {
    it("keeps one stable model and emits deterministic revision events", () => {
        const { monaco } = createMonaco()
        const registry = new ScriptModelRegistry(monaco)
        const project = registry.open(uri(monaco, "one"), "const value = 1")
        const events: Array<{ revision: number; dirty: boolean }> = []
        project.onDidChangeRevision((event) => events.push(event))

        project.model.setValue("const value = 2")
        expect(project.markSaved()).toBe(true)
        project.model.setValue("const value = 3")

        expect(registry.open(uri(monaco, "one"), "ignored")).toBe(project)
        expect(events).toEqual([
            { revision: 1, dirty: true },
            { revision: 2, dirty: true },
        ])
        expect(project.revision).toBe(2)
        expect(project.dirty).toBe(true)
        expect(project.markSaved(1 as never)).toBe(false)
        registry.dispose()
    })

    it("disposes a project's model, markers, and registered providers", () => {
        const { monaco, setModelMarkers } = createMonaco()
        const registry = new ScriptModelRegistry(monaco)
        const project = registry.open(uri(monaco, "dispose"), "")
        const disposeProvider = vi.fn()
        project.addProvider({ dispose: disposeProvider })
        project.setDiagnostics("dtm-script-analyzer", [], [{ message: "problem" } as never])
        project.dispose()

        expect(disposeProvider).toHaveBeenCalledOnce()
        expect(setModelMarkers).toHaveBeenCalledWith(project.model, "dtm-script-analyzer", [])
        expect(project.model.isDisposed()).toBe(true)
        expect(registry.get(uri(monaco, "dispose"))).toBeUndefined()
        registry.dispose()
    })

    it("makes stale handles inert after reopening the same URI", () => {
        const { monaco, setModelMarkers } = createMonaco()
        const registry = new ScriptModelRegistry(monaco)
        const projectUri = uri(monaco, "reopened")
        const old = registry.open(projectUri, "old")
        old.dispose()
        const fresh = registry.open(projectUri, "fresh")
        setModelMarkers.mockClear()

        old.dispose()

        expect(registry.get(projectUri)).toBe(fresh)
        expect(fresh.model.isDisposed()).toBe(false)
        expect(() => old.onDidChangeRevision(() => {})).toThrow("disposed")
        expect(() => old.setDiagnostics("dtm-script-analyzer", [])).toThrow("disposed")
        const providerDispose = vi.fn()
        expect(() => old.addProvider({ dispose: providerDispose })).toThrow("disposed")
        expect(providerDispose).toHaveBeenCalledOnce()
        expect(old.markSaved()).toBe(false)
        expect(setModelMarkers).not.toHaveBeenCalled()
        registry.dispose()
    })

    it("loads declarations once per registry and releases them on disposal", () => {
        const { monaco, addExtraLib, declarationDispose } = createMonaco()
        const registry = new ScriptModelRegistry(monaco)
        registry.open(uri(monaco, "a"), "")
        registry.open(uri(monaco, "b"), "")
        expect(addExtraLib).toHaveBeenCalledTimes(1)
        registry.dispose()
        expect(declarationDispose).toHaveBeenCalledOnce()
    })

    it("preserves separate model undo stacks and editor view states when switching", () => {
        const { monaco } = createMonaco()
        const registry = new ScriptModelRegistry(monaco)
        const first = registry.open(uri(monaco, "first"), "first")
        const second = registry.open(uri(monaco, "second"), "second")
        const firstState = { cursorState: [], viewState: {} } as never
        const editor = {
            saveViewState: vi.fn().mockReturnValue(firstState),
            restoreViewState: vi.fn(),
            setModel: vi.fn(),
            focus: vi.fn(),
            dispose: vi.fn(),
        } as unknown as Monaco.editor.IStandaloneCodeEditor
        const session = new ScriptEditorSession(editor)

        session.switchTo(first)
        first.model.pushEditOperations(
            [],
            [{ range: first.model.getFullModelRange(), text: "edited" }],
            () => null,
        )
        session.switchTo(second)
        session.switchTo(first)

        expect(editor.setModel).toHaveBeenNthCalledWith(1, first.model)
        expect(editor.setModel).toHaveBeenNthCalledWith(2, second.model)
        expect(editor.restoreViewState).toHaveBeenCalledWith(firstState)
        first.model.undo()
        expect(first.model.getValue()).toBe("first")
        expect(second.model.getValue()).toBe("second")
        session.dispose()
        registry.dispose()
    })
})
