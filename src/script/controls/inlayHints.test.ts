import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { expect, it, vi } from "vitest"
import { type AnalysisResponse, analyzeScript } from "../analysis"
import type { SelectedInput } from "../contracts"
import { deferred, harness } from "./testHelpers"

const range = { containsPosition: () => true } as unknown as Monaco.Range
const token = {} as Monaco.CancellationToken
const body =
    'const amount = dtm.param(1, { id: "amount" })\nconst photo = await dtm.input({ id: "photo" })'

it("refreshes hint values, image filenames and valid positions, filtering unrelated models", async () => {
    const h = harness(body, {
        selectImage: async () => ({
            type: "localFile",
            inputId: "photo",
            displayName: "input.png",
            selectionToken: "opaque",
        }),
    })
    await h.controller.analyze()
    const binding = h.controller.bindInlayHints(h.monaco)
    const provider = h.provider()
    const refresh = vi.fn()
    const subscription = provider.onDidChangeInlayHints?.(refresh)
    const read = async (model = h.project.model, wantedRange = range) =>
        (await provider.provideInlayHints(model, wantedRange, token))?.hints
    const initial = await read()
    expect(initial?.map((hint) => hint.label)).toEqual([" = 1", " = No image selected"])
    h.controller.setValue("amount", { type: "number", value: 4 })
    expect(refresh).toHaveBeenCalled()
    expect((await read())?.[0].label).toBe(" = 4")
    await h.controller.selectImage("photo")
    expect((await read())?.[1].label).toBe(' = "input.png"')
    const model = h.project.model
    h.project.model.setValue(`\n\n${h.project.model.getValue()}`)
    expect(await read()).toEqual([])
    await h.controller.analyze()
    const moved = await read()
    expect(moved?.[0].position.lineNumber).toBe((initial?.[0].position.lineNumber ?? 0) + 2)
    expect(moved?.[0].label).toBe(" = 4")
    expect(h.project.model).toBe(model)
    expect(h.monaco.editor.createModel).toHaveBeenCalledTimes(1)
    expect(
        await read({
            getPositionAt: () => {
                throw new Error("Unrelated model was queried")
            },
        } as unknown as Monaco.editor.ITextModel),
    ).toEqual([])
    expect(await read(model, { containsPosition: () => false } as unknown as Monaco.Range)).toEqual(
        [],
    )
    subscription?.dispose()
    refresh.mockClear()
    h.controller.setValue("amount", { type: "number", value: 5 })
    expect(refresh).not.toHaveBeenCalled()
    provider.onDidChangeInlayHints?.(refresh)
    binding.dispose()
    binding.dispose()
    h.controller.setValue("amount", { type: "number", value: 6 })
    expect(refresh).not.toHaveBeenCalled()
    expect(h.providerDispose).toHaveBeenCalledTimes(1)
    h.dispose()
    expect(h.providerDispose).toHaveBeenCalledTimes(1)
})

it("releases providers/subscriptions and ignores pending results when the model is disposed", async () => {
    const selection = deferred<SelectedInput | null>()
    const h = harness(body, { selectImage: () => selection.promise })
    await h.controller.analyze()
    h.controller.bindInlayHints(h.monaco)
    const provider = h.provider()
    const refresh = vi.fn()
    provider.onDidChangeInlayHints?.(refresh)
    const changes = vi.fn()
    h.controller.onDidChange(changes)
    const pendingAnalysis = deferred<AnalysisResponse>()
    h.analysis.analyze.mockReturnValueOnce(pendingAnalysis.promise)
    const pending = h.controller.analyze()
    const pick = h.controller.selectImage("photo")
    h.project.dispose()
    expect(h.providerDispose).toHaveBeenCalledTimes(1)
    expect(h.listeners()).toEqual({ content: 0, disposal: 0 })
    expect(h.controller.getHints()).toEqual([])
    refresh.mockClear()
    changes.mockClear()
    pendingAnalysis.resolve(analyzeScript({ source: "", sourceRevision: h.project.revision }))
    selection.resolve({
        type: "localFile",
        inputId: "photo",
        displayName: "late.png",
        selectionToken: "late",
    })
    expect(await pending).toBe(false)
    await pick
    expect(h.controller.runtimeSnapshot().inputs).toEqual([])
    expect(h.controller.setValue("amount", { type: "number", value: 9 })).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
    expect(changes).not.toHaveBeenCalled()
    expect(await provider.provideInlayHints(h.project.model, range, token)).toMatchObject({
        hints: [],
    })
    h.dispose()
})

it("emits independent revision events and explicit value commit events", async () => {
    const h = harness(body)
    const listener = vi.fn()
    const subscription = h.controller.onDidChange(listener)
    await h.controller.analyze()
    const initial = h.controller.state.valueRevision
    h.controller.setValue("amount", { type: "number", value: 4 })
    h.controller.commitValue()
    expect(
        listener.mock.calls.map(([event]) => [
            event.kind,
            event.phase,
            event.valueRevision,
            event.inputRevision,
        ]),
    ).toEqual([
        ["analysis", "change", initial, 0],
        ["value", "change", initial + 1, 0],
        ["value", "commit", initial + 1, 0],
    ])
    subscription.dispose()
    listener.mockClear()
    h.controller.reset("amount")
    expect(listener).not.toHaveBeenCalled()
    h.dispose()
})
