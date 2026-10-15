import type { Environment } from "monaco-editor/editor/editor.api.js"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import "monaco-editor/languages/definitions/javascript/register.js"
import "monaco-editor/languages/definitions/typescript/register.js"

const monacoGlobal = globalThis as typeof globalThis & { MonacoEnvironment?: Environment }
const environment = monacoGlobal.MonacoEnvironment
const previousGetWorker = environment?.getWorker?.bind(environment)

monacoGlobal.MonacoEnvironment = {
    ...environment,
    getWorker(moduleId, label) {
        if (label === "typescript" || label === "javascript") return new TypeScriptWorker()
        if (label === "editorWorkerService") return new EditorWorker()
        return previousGetWorker?.(moduleId, label) ?? new EditorWorker()
    },
}
