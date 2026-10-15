import "./monacoWorkers"
import * as monaco from "monaco-editor/editor/editor.api.js"
import { typescriptDefaults } from "monaco-editor/language/typescript/monaco.contribution.js"
import { ScriptModelRegistry } from "./modelRegistry"

/** Create a registry using Monaco 0.57's modular editor and TypeScript contribution APIs. */
export function createScriptModelRegistry(): ScriptModelRegistry {
    return new ScriptModelRegistry(monaco, typescriptDefaults)
}
