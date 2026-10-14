import { TypeScriptWorker } from "monaco-editor/languages/features/typescript/tsWorker.js"
import { describe, expect, it, vi } from "vitest"
import { DTM_DECLARATION, DTM_DECLARATION_URI, registerDtmDeclarations } from "./dtmDeclarations"
import { createRuntimeInlayHintProvider } from "./inlayHints"

const MODEL_URI = "file:///dtm/probe.ts"
const SOURCE = `createImageProcess(async (dtm) => {
    dtm.
    const invalid: number = "wrong"
    return await dtm.input()
})`

function createLanguageWorker() {
    return new TypeScriptWorker(
        {
            getMirrorModels: () => [
                {
                    uri: {
                        path: "/dtm/probe.ts",
                        toString: () => MODEL_URI,
                    },
                    version: 1,
                    getValue: () => SOURCE,
                },
            ],
        },
        {
            compilerOptions: {
                allowNonTsExtensions: true,
                module: 99,
                moduleResolution: 100,
                noEmit: true,
                strict: true,
                target: 99,
            },
            extraLibs: {
                [DTM_DECLARATION_URI]: { content: DTM_DECLARATION, version: 1 },
            },
            inlayHintsOptions: {},
        },
    )
}

describe("Monaco viability harness", () => {
    it("loads and disposes the replaceable DTM declaration library", () => {
        const dispose = vi.fn()
        const addExtraLib = vi.fn(() => ({ dispose }))

        const registration = registerDtmDeclarations({ addExtraLib })

        expect(addExtraLib).toHaveBeenCalledWith(DTM_DECLARATION, DTM_DECLARATION_URI)
        registration.dispose()
        expect(dispose).toHaveBeenCalledOnce()
    })

    it("uses Monaco's TypeScript worker for DTM completion and diagnostics", async () => {
        const worker = createLanguageWorker()
        const completionPosition = SOURCE.indexOf("dtm.") + "dtm.".length

        const [diagnostics, completions] = await Promise.all([
            worker.getSemanticDiagnostics(MODEL_URI),
            worker.getCompletionsAtPosition(MODEL_URI, completionPosition),
        ])

        expect(diagnostics.map(({ code }) => code)).toContain(2322)
        expect(completions?.entries.map(({ name }) => name)).toEqual(
            expect.arrayContaining(["input", "param"]),
        )
    })

    it("provides runtime values through a custom Monaco inlay provider", async () => {
        const containsPosition = vi.fn(() => true)
        const provider = createRuntimeInlayHintProvider(
            { languages: { InlayHintKind: { Parameter: 2 } } } as never,
            () => [{ offset: 12, label: "runtime 0.75" }],
        )

        const result = await provider.provideInlayHints(
            { getPositionAt: () => ({ lineNumber: 1, column: 13 }) } as never,
            { containsPosition } as never,
            { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) },
        )

        expect(result).toMatchObject({
            hints: [{ label: " = runtime 0.75", kind: 2 }],
        })
        expect(containsPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 13 })
    })
})
