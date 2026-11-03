import { snapshot } from "valtio/vanilla"
import { describe, expect, it, vi } from "vitest"
import { type AnalysisResponse, analyzeScript } from "../analysis"
import type { SelectedInput, SourceRevision } from "../contracts"
import type { EditorAnalysisClient } from "../editor/analysisClient"
import { deferred, harness } from "./testHelpers"

const number = (value: number, options = "") =>
    `const amount = dtm.param(${value}, { id: "amount"${options} })`
const image = 'const photo = await dtm.input({ id: "photo", label: "Source image" })'
const selected = (token = "approved"): SelectedInput => ({
    type: "localFile",
    inputId: "photo",
    displayName: "photo.png",
    selectionToken: token,
})

describe("generated runtime controls", () => {
    it("leaves source, model identity and revision unchanged on parameter edits and selection", async () => {
        const h = harness(
            `${number(1)}\nconst enabled = dtm.param(true)\nconst title = dtm.param("Hi")\n${image}`,
            { selectImage: async () => selected() },
        )
        await h.controller.analyze()
        const model = h.project.model
        const source = model.getValue()
        const revision = h.project.revision
        const [amount, enabled, title] = h.controller.state.controls
        h.controller.setValue(amount.descriptor.id, { type: "number", value: 3 })
        h.controller.setValue(enabled.descriptor.id, { type: "boolean", value: false })
        h.controller.setValue(title.descriptor.id, { type: "text", value: "New title" })
        await h.controller.selectImage("photo")
        expect(model.getValue()).toBe(source)
        expect(model.setValue).not.toHaveBeenCalled()
        expect(h.project.revision).toBe(revision)
        expect(h.registry.open(h.project.uri, "ignored").model).toBe(model)
        expect(h.monaco.editor.createModel).toHaveBeenCalledTimes(1)
        expect(h.controller.runtimeSnapshot()).toMatchObject({
            values: { amount: { type: "number", value: 3 } },
            inputs: [selected()],
        })
        expect(JSON.stringify(snapshot(h.controller.state))).not.toContain("createImageProcess")
        expect(h.controller.state.controls.map((item) => item.descriptor.label)).toEqual([
            "Amount",
            "Enabled",
            "Title",
            "Source image",
        ])
        h.dispose()
    })

    it("follows defaults until touched and reconciles stable IDs across label/order/range changes", async () => {
        const h = harness(number(1))
        await h.controller.analyze()
        await h.update(number(2))
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 2 },
            touched: false,
        })
        h.controller.setValue("amount", { type: "number", value: 7 })
        await h.update(`const other = dtm.param(false)\n${number(3, ', label: "Renamed"')}`)
        expect(h.controller.state.controls.map((item) => item.descriptor.label)).toEqual([
            "Other",
            "Renamed",
        ])
        expect(h.controller.state.controls[1]).toMatchObject({ value: { value: 7 }, touched: true })
        h.controller.reset("amount")
        expect(h.controller.state.controls[1]).toMatchObject({
            value: { value: 3 },
            touched: false,
        })
        await h.update(number(4))
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 4 },
            touched: false,
        })
        // Selecting the existing default is still an intentional user choice.
        h.controller.setValue("amount", { type: "number", value: 4 })
        await h.update(number(5))
        expect(h.controller.state.controls[0]).toMatchObject({ value: { value: 4 }, touched: true })
        h.dispose()
    })

    it("resets type changes, preserves compatible numeric kinds and removes obsolete IDs", async () => {
        const h = harness(number(1))
        await h.controller.analyze()
        h.controller.setValue("amount", { type: "number", value: 3 })
        await h.update(number(2, ", min: 0, max: 10"))
        expect(h.controller.state.controls[0]).toMatchObject({
            descriptor: { type: "slider" },
            value: { value: 3 },
            touched: true,
        })
        await h.update('dtm.param("text", { id: "amount" })')
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { type: "text", value: "text" },
            touched: false,
        })
        await h.update('dtm.param(false, { id: "amount" })')
        expect(h.controller.state.controls[0].value).toEqual({ type: "boolean", value: false })
        await h.update('await dtm.input({ id: "amount" })')
        expect(h.controller.runtimeSnapshot().values).toEqual({})
        expect(h.controller.state.controls[0]).toMatchObject({
            value: null,
            selection: null,
            touched: false,
        })
        await h.update("")
        expect(h.controller.state.controls).toEqual([])
        expect(h.controller.runtimeSnapshot().inputs).toEqual([])
        await h.update(number(6))
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 6 },
            touched: false,
        })
        h.dispose()
    })

    it("rejects duplicate IDs atomically even if an injected analyzer claims success", async () => {
        const h = harness(number(1))
        await h.controller.analyze()
        h.controller.setValue("amount", { type: "number", value: 9 })
        const before = h.controller.runtimeSnapshot()
        h.analysis.analyze.mockImplementationOnce(async (request) => {
            const result = analyzeScript(request)
            result.controls.push({ ...result.controls[0], label: "Duplicate" })
            return result
        })
        expect(await h.controller.analyze()).toBe(false)
        expect(h.controller.state.analysisError).toContain("duplicate ID")
        expect(h.controller.state.controls).toHaveLength(1)
        expect(h.controller.runtimeSnapshot()).toEqual(before)
        expect(h.controller.getHints()).toEqual([])
        // Real analyzer duplicate diagnostics are rejected too.
        await h.update(`${number(1)}\ndtm.param(2, { id: "amount" })`)
        expect(h.controller.runtimeSnapshot()).toEqual(before)
        h.dispose()
    })

    it("clamps changed bounds/steps visibly and keeps invalid drafts out of run values", async () => {
        const h = harness(number(8))
        await h.controller.analyze()
        h.controller.setValue("amount", { type: "number", value: 9 })
        await h.update(number(0, ", min: 0, max: 5, step: 2"))
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 4 },
            touched: true,
            notice: expect.stringContaining("Adjusted from 9 to 4"),
        })
        h.controller.editNumber("amount", "")
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 4 },
            draft: "",
            error: "Enter a finite number.",
        })
        h.controller.commitNumber("amount")
        expect(h.controller.state.controls[0].draft).toBeNull()
        expect(h.controller.setValue("amount", { type: "number", value: Infinity })).toBe(false)
        expect(h.controller.setValue("amount", { type: "text", value: "bad" })).toBe(false)
        h.controller.reset("amount")
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 0 },
            touched: false,
            error: null,
        })
        await h.update(number(20, ", min: 0, max: 6, step: 2"))
        expect(h.controller.state.controls[0]).toMatchObject({
            value: { value: 6 },
            touched: false,
            notice: expect.stringContaining("20 to 6"),
        })
        h.dispose()
    })

    it("retains the last valid schema during invalid analysis and hides old positions immediately", async () => {
        const h = harness(number(1))
        await h.controller.analyze()
        const last = snapshot(h.controller.state).controls
        expect(h.controller.getHints()).toHaveLength(1)
        h.project.model.setValue("createImageProcess(async (dtm) => { dtm.param(")
        expect(h.controller.state.analysisStatus).toBe("pending")
        expect(h.controller.getHints()).toEqual([])
        expect(await h.controller.analyze()).toBe(false)
        expect(snapshot(h.controller.state).controls).toEqual(last)
        expect(h.controller.state.analysisStatus).toBe("invalid")
        h.controller.setValue("amount", { type: "number", value: 8 })
        expect(h.controller.getHints()).toEqual([])
        await h.update(`\n\n${number(1)}`)
        expect(h.controller.getHints()[0]).toEqual({
            offset: h.controller.state.controls[0].descriptor.sourceRange.end.offset,
            label: "8",
        })
        h.dispose()
    })

    it("ignores old requests, wrong revisions and transport failures without replacing controls", async () => {
        const h = harness(number(1))
        await h.controller.analyze()
        const old = deferred<AnalysisResponse>()
        h.analysis.analyze.mockReturnValueOnce(old.promise)
        const pending = h.controller.analyze()
        await h.update(number(2))
        old.resolve({
            ...analyzeScript({ source: "", sourceRevision: 0 as SourceRevision }),
            controls: [],
        })
        expect(await pending).toBe(false)
        expect(h.controller.state.controls[0].value?.value).toBe(2)
        h.analysis.analyze.mockImplementationOnce(async (request) => ({
            ...analyzeScript(request),
            sourceRevision: 99 as SourceRevision,
        }))
        expect(await h.controller.analyze()).toBe(false)
        expect(h.controller.state.analysisError).toContain("revision mismatch")
        expect(h.controller.getHints()).toEqual([])
        h.analysis.analyze.mockRejectedValueOnce(new Error("worker unavailable"))
        expect(await h.controller.analyze()).toBe(false)
        expect(h.controller.state.controls[0].value?.value).toBe(2)
        expect(h.controller.state.analysisError).toContain("failed")
        h.dispose()
    })

    it("scopes equal revisions and out-of-order results to the requesting project/model", async () => {
        const aResponse = deferred<AnalysisResponse>()
        const bResponse = deferred<AnalysisResponse>()
        const client = {
            analyze: vi
                .fn<EditorAnalysisClient["analyze"]>()
                .mockReturnValueOnce(aResponse.promise)
                .mockReturnValueOnce(bResponse.promise),
            dispose: vi.fn(),
        }
        const a = harness(number(1), { id: "a", analysis: client })
        const b = harness(number(2), { id: "b", analysis: client })
        const aPending = a.controller.analyze()
        const bPending = b.controller.analyze()
        bResponse.resolve(analyzeScript(client.analyze.mock.calls[1][0]))
        await bPending
        aResponse.resolve(analyzeScript(client.analyze.mock.calls[0][0]))
        await aPending
        expect(a.project.revision).toBe(b.project.revision)
        expect(a.controller.state.controls[0].value?.value).toBe(1)
        expect(b.controller.state.controls[0].value?.value).toBe(2)
        a.dispose()
        expect(client.dispose).not.toHaveBeenCalled()
        b.dispose()
    })

    it("treats arbitrary stable IDs as data and returns independent runtime snapshots", async () => {
        const h = harness('dtm.param(1, { id: "__proto__" })')
        await h.controller.analyze()
        const runtime = h.controller.runtimeSnapshot()
        expect(Object.hasOwn(runtime.values, "__proto__")).toBe(true)
        const specialId = "__proto__"
        runtime.values[specialId].value = 99
        expect(h.controller.state.controls[0].value?.value).toBe(1)
        h.dispose()
    })

    it("does not let an older same-revision request invalidate newer accepted analysis", async () => {
        const h = harness(number(1))
        const old = deferred<AnalysisResponse>()
        h.analysis.analyze.mockReturnValueOnce(old.promise)
        const pending = h.controller.analyze()
        await h.controller.analyze()
        old.resolve({ sourceRevision: h.project.revision, controls: [], diagnostics: [] })
        expect(await pending).toBe(false)
        expect(h.controller.state.analysisStatus).toBe("valid")
        expect(h.controller.getHints()[0].label).toBe("1")
        h.dispose()
    })

    it("does not advance runtime revisions for label/range/order-only changes", async () => {
        const h = harness(`${number(1)}\n${image}`, { selectImage: async () => selected() })
        await h.controller.analyze()
        await h.controller.selectImage("photo")
        const before = h.controller.runtimeSnapshot()
        await h.update(`${image}\n\n${number(1, ', label: "New label"')}`)
        expect(h.controller.state.valueRevision).toBe(before.valueRevision)
        expect(h.controller.state.inputRevision).toBe(before.inputRevision)
        expect(h.controller.runtimeSnapshot().inputs).toEqual(before.inputs)
        expect(h.controller.state.controls[1].descriptor.label).toBe("New label")
        h.dispose()
    })
})

describe("image selections", () => {
    it("keeps selections separate and cancellation preserves the previous approval", async () => {
        const picker = vi.fn().mockResolvedValueOnce(selected()).mockResolvedValueOnce(null)
        const h = harness(image, { selectImage: picker })
        await h.controller.analyze()
        await h.controller.selectImage("photo")
        const before = h.controller.runtimeSnapshot()
        await h.controller.selectImage("photo")
        expect(h.controller.runtimeSnapshot()).toEqual(before)
        expect(before.values).toEqual({})
        expect(h.controller.getHints()[0].label).toBe('"photo.png"')
        h.controller.reset("photo")
        expect(h.controller.runtimeSnapshot().inputs).toEqual([])
        expect(h.controller.state.controls[0]).toMatchObject({ touched: false, selecting: false })
        h.dispose()
    })

    it("rejects late responses after reset, replacement, removal/re-addition and disposal", async () => {
        const first = deferred<SelectedInput | null>()
        const second = deferred<SelectedInput | null>()
        const removed = deferred<SelectedInput | null>()
        const disposed = deferred<SelectedInput | null>()
        const picker = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
            .mockReturnValueOnce(removed.promise)
            .mockReturnValueOnce(disposed.promise)
        const h = harness(image, { selectImage: picker })
        await h.controller.analyze()
        const one = h.controller.selectImage("photo")
        h.controller.reset("photo")
        expect(picker.mock.calls[0][0].signal.aborted).toBe(true)
        const two = h.controller.selectImage("photo")
        second.resolve(selected("new"))
        await two
        first.resolve(selected("old"))
        await one
        expect(h.controller.runtimeSnapshot().inputs).toEqual([selected("new")])
        const three = h.controller.selectImage("photo")
        await h.update("")
        await h.update(image)
        removed.resolve(selected("removed"))
        await three
        expect(h.controller.runtimeSnapshot().inputs).toEqual([])
        const four = h.controller.selectImage("photo")
        h.controller.dispose()
        disposed.resolve(selected("disposed"))
        await four
        expect(h.controller.runtimeSnapshot().inputs).toEqual([])
        expect(h.controller.state.controls[0].selecting).toBe(false)
        h.dispose()
    })

    it("isolates the same control ID across projects and supersedes older picker requests", async () => {
        const old = deferred<SelectedInput | null>()
        const latest = deferred<SelectedInput | null>()
        const other = deferred<SelectedInput | null>()
        const picker = vi
            .fn()
            .mockReturnValueOnce(old.promise)
            .mockReturnValueOnce(other.promise)
            .mockReturnValueOnce(latest.promise)
        const a = harness(image, { id: "a", selectImage: picker })
        const b = harness(image, { id: "b", selectImage: picker })
        await a.controller.analyze()
        await b.controller.analyze()
        const one = a.controller.selectImage("photo")
        const two = b.controller.selectImage("photo")
        const three = a.controller.selectImage("photo")
        expect(picker.mock.calls.map(([request]) => request.projectId)).toEqual(["a", "b", "a"])
        expect(picker.mock.calls[0][0].signal.aborted).toBe(true)
        latest.resolve(selected("a"))
        other.resolve(selected("b"))
        old.resolve(selected("old"))
        await Promise.all([one, two, three])
        expect(a.controller.runtimeSnapshot().inputs).toEqual([selected("a")])
        expect(b.controller.runtimeSnapshot().inputs).toEqual([selected("b")])
        a.dispose()
        b.dispose()
    })

    it("copies only approved metadata, displays filenames and reports failed/mismatched selections", async () => {
        const picker = vi
            .fn()
            .mockResolvedValueOnce({
                ...selected(),
                displayName: "/private/user/photo.png",
                path: "/secret",
                bytes: [1, 2],
            })
            .mockResolvedValueOnce({
                type: "drawThings",
                inputId: "photo",
                displayName: "DT image",
                resourceId: "resource-opaque",
            })
            .mockResolvedValueOnce({ ...selected(), inputId: "wrong" })
            .mockRejectedValueOnce(new Error("failed /private/path"))
        const h = harness(image, { selectImage: picker })
        await h.controller.analyze()
        await h.controller.selectImage("photo")
        expect(h.controller.runtimeSnapshot().inputs).toEqual([selected()])
        await h.controller.selectImage("photo")
        const before = h.controller.runtimeSnapshot()
        expect(before.inputs).toEqual([
            {
                type: "drawThings",
                inputId: "photo",
                displayName: "DT image",
                resourceId: "resource-opaque",
            },
        ])
        await h.controller.selectImage("photo")
        await h.controller.selectImage("photo")
        expect(h.controller.runtimeSnapshot()).toEqual(before)
        expect(h.controller.state.controls[0]).toMatchObject({
            selecting: false,
            error: expect.stringContaining("Image selection failed"),
        })
        expect(JSON.stringify(snapshot(h.controller.state))).not.toContain("/private")
        h.dispose()
    })
})
