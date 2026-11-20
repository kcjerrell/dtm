// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RasterRequest } from "./raster"
import { drawRaster, type RasterReply } from "./rasterDrawing"

vi.mock("./rasterDrawing", () => ({ drawRaster: vi.fn() }))

class TestWorker extends EventTarget {
    static current: TestWorker
    static supported = true
    static handshakes = true
    readonly postMessage = vi.fn()
    readonly terminate = vi.fn()

    constructor() {
        super()
        TestWorker.current = this
        if (TestWorker.handshakes) {
            queueMicrotask(() => this.reply({ kind: "ready", supported: TestWorker.supported }))
        }
    }

    reply(data: RasterReply) {
        this.dispatchEvent(new MessageEvent("message", { data }))
    }
}

function bitmap() {
    return {
        width: 2,
        height: 2,
        close: vi.fn(),
    } satisfies ImageBitmap
}

function edges(image = document.createElement("img")): Extract<RasterRequest, { kind: "edges" }> {
    return { kind: "edges", image, width: 2, height: 2, upscale: 1 }
}

const capture = vi.fn(async (_image: HTMLImageElement) => bitmap())

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    TestWorker.supported = true
    TestWorker.handshakes = true
    vi.stubGlobal("Worker", TestWorker)
    vi.stubGlobal("createImageBitmap", capture)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("Compare raster worker", () => {
    it("transfers decoded images to the worker and gives the caller ownership of the result", async () => {
        const { renderRaster, releaseRaster } = await import("./raster")
        const signal = new AbortController().signal
        const job = edges()
        const input = bitmap()
        capture.mockResolvedValueOnce(input)
        const result = renderRaster(job, signal)
        const worker = TestWorker.current
        await vi.waitFor(() =>
            expect(worker.postMessage).toHaveBeenCalledWith({ ...job, image: input }, [input]),
        )

        const output = bitmap()
        worker.reply({ kind: "bitmap", bitmap: output })
        expect(await result).toBe(output)
        expect(drawRaster).not.toHaveBeenCalled()
        expect(input.close).not.toHaveBeenCalled()
        releaseRaster(output)
        expect(output.close).toHaveBeenCalledOnce()
    })

    it("drops an aborted queued job and replaces a worker whose running job is aborted", async () => {
        const { renderRaster } = await import("./raster")
        const running = new AbortController()
        const queued = new AbortController()
        const active = renderRaster(edges(), running.signal)
        const worker = TestWorker.current
        await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce())

        const obsolete = renderRaster(edges(), queued.signal)
        const pendingJob = edges()
        const pending = renderRaster(pendingJob, new AbortController().signal)
        const abortedActive = expect(active).rejects.toMatchObject({ name: "AbortError" })
        const abortedQueued = expect(obsolete).rejects.toMatchObject({ name: "AbortError" })
        expect(capture).toHaveBeenCalledOnce()
        running.abort()
        queued.abort()
        await Promise.all([abortedActive, abortedQueued])
        expect(worker.terminate).toHaveBeenCalledOnce()
        await vi.waitFor(() => expect(TestWorker.current).not.toBe(worker))
        const replacement = TestWorker.current
        await vi.waitFor(() => expect(replacement.postMessage).toHaveBeenCalledOnce())
        expect(capture).toHaveBeenCalledTimes(2)
        expect(capture).toHaveBeenLastCalledWith(pendingJob.image)

        // A result already posted by the terminated worker can race the abort.
        const obsoleteResult = bitmap()
        worker.reply({ kind: "bitmap", bitmap: obsoleteResult })
        expect(obsoleteResult.close).toHaveBeenCalledOnce()

        const output = bitmap()
        replacement.reply({ kind: "bitmap", bitmap: output })
        expect(await pending).toBe(output)
    })

    it("releases a delivered bitmap if the caller aborts before consuming it", async () => {
        const { renderRaster } = await import("./raster")
        const controller = new AbortController()
        const pending = renderRaster(edges(), controller.signal)
        const worker = TestWorker.current
        await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce())

        const output = bitmap()
        const aborted = expect(pending).rejects.toMatchObject({ name: "AbortError" })
        worker.reply({ kind: "bitmap", bitmap: output })
        controller.abort()
        await aborted
        await vi.waitFor(() => expect(output.close).toHaveBeenCalledOnce())
        expect(worker.terminate).not.toHaveBeenCalled()
    })

    it("closes a decoded bitmap if capturing another input throws synchronously", async () => {
        const { renderRaster } = await import("./raster")
        const input = bitmap()
        capture.mockResolvedValueOnce(input).mockImplementationOnce(() => {
            throw new Error("Decode failed")
        })
        const pending = renderRaster(
            {
                kind: "slider",
                effect: "brightness",
                imageA: document.createElement("img"),
                imageB: document.createElement("img"),
                options: {},
            },
            new AbortController().signal,
        )
        await expect(pending).rejects.toThrow("Decode failed")
        expect(input.close).toHaveBeenCalledOnce()
        expect(TestWorker.current.postMessage).not.toHaveBeenCalled()
        expect(drawRaster).not.toHaveBeenCalled()
    })

    it("falls back when the worker has no offscreen 2D context", async () => {
        TestWorker.supported = false
        const { renderRaster, releaseRaster } = await import("./raster")
        const job = edges()
        const canvas = await renderRaster(job, new AbortController().signal)
        expect(canvas).toBeInstanceOf(HTMLCanvasElement)
        expect(TestWorker.current.terminate).toHaveBeenCalledOnce()
        expect(capture).not.toHaveBeenCalled()
        expect(drawRaster).toHaveBeenCalledWith(job, canvas)

        releaseRaster(canvas)
        expect(canvas.width).toBe(0)
        expect(canvas.height).toBe(0)
    })

    it("falls back and clears the queue when the worker never finishes starting up", async () => {
        TestWorker.handshakes = false
        vi.useFakeTimers()
        const { renderRaster } = await import("./raster")
        const job = edges()
        const first = renderRaster(job, new AbortController().signal)
        const second = renderRaster(job, new AbortController().signal)
        await vi.runOnlyPendingTimersAsync()
        const results = await Promise.all([first, second])
        expect(results.every((result) => result instanceof HTMLCanvasElement)).toBe(true)
        expect(TestWorker.current.terminate).toHaveBeenCalledOnce()
        expect(capture).not.toHaveBeenCalled()
        expect(drawRaster).toHaveBeenCalledTimes(2)
    })

    it("closes inputs and falls back if the browser rejects bitmap transfer", async () => {
        const { renderRaster } = await import("./raster")
        const input = bitmap()
        capture.mockResolvedValueOnce(input)
        const job = edges()
        const pending = renderRaster(job, new AbortController().signal)
        const worker = TestWorker.current
        worker.postMessage.mockImplementationOnce(() => {
            throw new DOMException("Cannot transfer image", "DataCloneError")
        })

        const canvas = await pending
        expect(canvas).toBeInstanceOf(HTMLCanvasElement)
        expect(input.close).toHaveBeenCalledOnce()
        expect(worker.terminate).toHaveBeenCalledOnce()
        expect(drawRaster).toHaveBeenCalledWith(job, canvas)
    })

    it("reports genuine worker raster failures without retrying on the UI thread", async () => {
        const { renderRaster } = await import("./raster")
        const pending = renderRaster(edges(), new AbortController().signal)
        const worker = TestWorker.current
        const rejected = expect(pending).rejects.toThrow("Could not read pixels")
        await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce())
        worker.reply({ kind: "error", message: "Could not read pixels" })
        await rejected
        expect(worker.terminate).not.toHaveBeenCalled()
        expect(drawRaster).not.toHaveBeenCalled()
    })
})
