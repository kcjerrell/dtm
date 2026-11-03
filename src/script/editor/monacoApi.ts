import "./monacoWorkers"
import * as monaco from "monaco-editor/editor/editor.api.js"
import {
    ModuleKind,
    ScriptTarget,
    typescriptDefaults,
} from "monaco-editor/language/typescript/monaco.contribution.js"
import { ScriptModelRegistry } from "./modelRegistry"

/** Create a registry using Monaco 0.57's modular editor and TypeScript contribution APIs. */
export function createScriptModelRegistry(): ScriptModelRegistry {
    typescriptDefaults.setCompilerOptions({
        ...typescriptDefaults.getCompilerOptions(),
        module: ModuleKind.ESNext,
        target: ScriptTarget.ESNext,
        noEmit: true,
        strict: true,
    })
    return new ScriptModelRegistry(monaco, typescriptDefaults)
}
