import "./monacoWorkers"
import * as monaco from "monaco-editor/editor/editor.api.js"
import {
    ModuleKind,
    type ModuleResolutionKind,
    ScriptTarget,
    typescriptDefaults,
} from "monaco-editor/language/typescript/monaco.contribution.js"
import { ScriptModelRegistry } from "./modelRegistry"
import { createMonacoPackageDeclarations } from "./packageDeclarations"

/** Create a registry using Monaco 0.57's modular editor and TypeScript contribution APIs. */
export function createScriptModelRegistry(): ScriptModelRegistry {
    typescriptDefaults.setCompilerOptions({
        ...typescriptDefaults.getCompilerOptions(),
        module: ModuleKind.ESNext,
        // Monaco 0.57 exposes the old resolution enum, but its worker also supports
        // TypeScript's Bundler mode (100), including package exports and types.
        moduleResolution: 100 as ModuleResolutionKind,
        target: ScriptTarget.ESNext,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
    })
    return new ScriptModelRegistry(monaco, typescriptDefaults)
}

export const createScriptPackageDeclarations = () =>
    createMonacoPackageDeclarations(typescriptDefaults)
