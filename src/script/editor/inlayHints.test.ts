import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { expect, it, vi } from "vitest"
import { createRuntimeInlayHintProvider } from "./inlayHints"

it("keeps the original provider API and excludes invalid offsets instead of clamping them into source", async () => {
    const model = {
        getValueLength: () => 5,
        getPositionAt: vi.fn((offset: number) => ({ lineNumber: 1, column: offset + 1 })),
    } as unknown as Monaco.editor.ITextModel
    const monaco = { languages: { InlayHintKind: { Parameter: 2 } } } as unknown as typeof Monaco
    const provider = createRuntimeInlayHintProvider(monaco, () => [
        { offset: 3, label: "true" },
        { offset: -1, label: "bad" },
        { offset: 6, label: "bad" },
        { offset: NaN, label: "bad" },
    ])
    const result = await provider.provideInlayHints(
        model,
        { containsPosition: () => true } as unknown as Monaco.Range,
        {} as Monaco.CancellationToken,
    )
    expect(result?.hints).toEqual([
        { position: { lineNumber: 1, column: 4 }, label: " = true", kind: 2 },
    ])
    expect(model.getPositionAt).toHaveBeenCalledTimes(1)
    result?.dispose()
})
