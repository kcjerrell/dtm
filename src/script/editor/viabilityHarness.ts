import "./monacoWorkers"
import * as monaco from "monaco-editor/editor/editor.api.js"
import {
    getTypeScriptWorker,
    typescriptDefaults,
} from "monaco-editor/language/typescript/monaco.contribution.js"
import { registerDtmDeclarations } from "./dtmDeclarations"
import { createRuntimeInlayHintProvider } from "./inlayHints"

const HARNESS_SOURCE = `createImageProcess(async (dtm) => {
    const image = await dtm.input({ label: "Source" })
    const strength = dtm.param(0.5, { min: 0, max: 1 })
    const invalid: number = "diagnostic proof"
    return image
})`

export interface MonacoViabilityHarness extends monaco.IDisposable {
    editor: monaco.editor.IStandaloneCodeEditor
    model: monaco.editor.ITextModel
    verifyLanguageFeatures(): Promise<{ diagnosticCodes: string[]; completionLabels: string[] }>
}

/** Internal-only probe. It is deliberately not wired into application navigation. */
export function createMonacoViabilityHarness(container: HTMLElement): MonacoViabilityHarness {
    const declarations = registerDtmDeclarations(typescriptDefaults)
    const model = monaco.editor.createModel(
        HARNESS_SOURCE,
        "typescript",
        monaco.Uri.parse("file:///dtm/viability-process.ts"),
    )
    const inlayProvider = monaco.languages.registerInlayHintsProvider(
        "typescript",
        createRuntimeInlayHintProvider(monaco, () => [
            { offset: model.getValue().indexOf("0.5") + 3, label: "runtime 0.75" },
        ]),
    )
    const editor = monaco.editor.create(container, { model, automaticLayout: true })

    return {
        editor,
        model,
        async verifyLanguageFeatures() {
            const workerFactory = await getTypeScriptWorker()
            const worker = await workerFactory(model.uri)
            const diagnostics = await worker.getSemanticDiagnostics(model.uri.toString())
            const completionOffset = model.getValue().indexOf("dtm.input") + "dtm.".length
            const completions = await worker.getCompletionsAtPosition(
                model.uri.toString(),
                completionOffset,
            )

            return {
                diagnosticCodes: diagnostics.map(({ code }) => String(code)),
                completionLabels:
                    completions?.entries.map((entry: { name: string }) => entry.name) ?? [],
            }
        },
        dispose() {
            editor.dispose()
            inlayProvider.dispose()
            model.dispose()
            declarations.dispose()
        },
    }
}
