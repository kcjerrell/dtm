// @vitest-environment jsdom

import * as monaco from "monaco-editor/editor/editor.api.js"
import {
    getTypeScriptWorker,
    typescriptDefaults,
} from "monaco-editor/language/typescript/monaco.contribution.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createScriptModelRegistry } from "./monacoApi"

vi.hoisted(() => {
    window.matchMedia ??= (query: string) =>
        ({
            matches: false,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent: () => true,
        }) as MediaQueryList
})

describe("Monaco 0.57 modular runtime integration", () => {
    const diagnosticsOptions = typescriptDefaults.getDiagnosticsOptions()
    afterEach(() => typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions))

    it("uses the real TypeScript contribution and real Monaco model lifecycle", async () => {
        // This model-only JSDOM test has no attached editor or native Worker implementation.
        // Actual worker diagnostics/completions are exercised separately by the viability tests.
        typescriptDefaults.setDiagnosticsOptions({ ...diagnosticsOptions, onlyVisible: true })
        expect(typescriptDefaults.addExtraLib).toBeTypeOf("function")
        const registry = createScriptModelRegistry()
        const uri = monaco.Uri.parse("file:///dtm/projects/browser/process.ts")
        const original = registry.open(uri, "const value = 1")
        expect(original.model.getLanguageId()).toBe("typescript")
        expect(await getTypeScriptWorker()).toBeTypeOf("function")

        original.model.pushEditOperations(
            [],
            [{ range: original.model.getFullModelRange(), text: "const value = 2" }],
            () => null,
        )
        expect(original.model.getValue()).toBe("const value = 2")
        original.model.undo()
        expect(original.model.getValue()).toBe("const value = 1")

        original.dispose()
        const reopened = registry.open(uri, "const value = 3")
        original.dispose()
        expect(registry.get(uri)).toBe(reopened)
        expect(reopened.model.isDisposed()).toBe(false)
        registry.dispose()
    })
})
