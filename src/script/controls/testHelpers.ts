import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { vi } from "vitest"
import { analyzeScript } from "../analysis"
import type { ProjectId } from "../contracts"
import type { EditorAnalysisClient } from "../editor/analysisClient"
import { type EditorMonacoApi, ScriptModelRegistry } from "../editor/modelRegistry"
import { type ImageSelector, ScriptControlsController } from "./controller"

export function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}

export const script = (body: string) => `createImageProcess(async (dtm) => {\n${body}\n})`

export function harness(
    body: string,
    options: { id?: string; selectImage?: ImageSelector; analysis?: EditorAnalysisClient } = {},
) {
    const models = new Map<string, Monaco.editor.ITextModel>()
    const revisionListeners = new Set<() => void>()
    const disposeListeners = new Set<() => void>()
    let provider: Monaco.languages.InlayHintsProvider | undefined
    const providerDispose = vi.fn()
    const monaco = {
        Uri: { parse: (value: string) => ({ toString: () => value }) },
        languages: {
            InlayHintKind: { Parameter: 2 },
            registerInlayHintsProvider: vi.fn(
                (_language: string, value: Monaco.languages.InlayHintsProvider) => {
                    provider = value
                    return { dispose: providerDispose }
                },
            ),
        },
        editor: {
            getModel: (uri: Monaco.Uri) => models.get(uri.toString()),
            createModel: vi.fn((initial: string, _language: string, uri: Monaco.Uri) => {
                let content = initial
                let disposed = false
                const model = {
                    uri,
                    getValue: vi.fn(() => content),
                    getValueLength: () => content.length,
                    setValue: vi.fn((value: string) => {
                        content = value
                        for (const listener of revisionListeners) listener()
                    }),
                    getPositionAt: (offset: number) => {
                        const lines = content.slice(0, offset).split("\n")
                        return { lineNumber: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
                    },
                    onDidChangeContent: (listener: () => void) => {
                        revisionListeners.add(listener)
                        return {
                            dispose: () => {
                                revisionListeners.delete(listener)
                            },
                        }
                    },
                    onWillDispose: (listener: () => void) => {
                        disposeListeners.add(listener)
                        return {
                            dispose: () => {
                                disposeListeners.delete(listener)
                            },
                        }
                    },
                    isDisposed: () => disposed,
                    dispose: () => {
                        for (const listener of disposeListeners) listener()
                        disposed = true
                        models.delete(uri.toString())
                    },
                } as unknown as Monaco.editor.ITextModel
                models.set(uri.toString(), model)
                return model
            }),
            setModelMarkers: vi.fn(),
        },
    } as unknown as typeof Monaco
    const registry = new ScriptModelRegistry(monaco as EditorMonacoApi, {
        addExtraLib: () => ({ dispose() {} }),
    })
    const project = registry.open(
        monaco.Uri.parse(`file:///${options.id ?? "p"}/process.ts`),
        script(body),
    )
    const analysis = {
        analyze: vi.fn(async (request) => analyzeScript(request)),
        dispose: vi.fn(),
    } satisfies EditorAnalysisClient
    const controller = new ScriptControlsController({
        projectId: (options.id ?? "p") as ProjectId,
        project,
        analysis: options.analysis ?? analysis,
        selectImage: options.selectImage,
    })
    return {
        controller,
        project,
        registry,
        monaco,
        analysis,
        providerDispose,
        provider: () => {
            if (!provider) throw new Error("Bind hints before reading the provider")
            return provider
        },
        listeners: () => ({ content: revisionListeners.size, disposal: disposeListeners.size }),
        update: async (body: string) => {
            project.model.setValue(script(body))
            return controller.analyze()
        },
        dispose: () => {
            controller.dispose()
            registry.dispose()
        },
    }
}
