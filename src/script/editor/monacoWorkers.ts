import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"

type MonacoEnvironment = {
    getWorker?(moduleId: string, label: string): Worker
}

const environment = (globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment })
    .MonacoEnvironment
const previousGetWorker = environment?.getWorker?.bind(environment)

;(globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = {
    ...environment,
    getWorker(moduleId, label) {
        if (label === "typescript" || label === "javascript") return new TypeScriptWorker()
        if (label === "editorWorkerService") return new EditorWorker()
        return previousGetWorker?.(moduleId, label) ?? new EditorWorker()
    },
}
