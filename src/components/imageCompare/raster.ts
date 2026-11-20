import { drawRaster, type RasterJob, type RasterReply } from "./rasterDrawing"

export type RasterSource = ImageBitmap | HTMLCanvasElement
export type RasterRequest = RasterJob<HTMLImageElement>

class WorkerUnavailable extends Error {}

const WORKER_STARTUP_TIMEOUT_MS = 5_000
let workerStartup: Promise<Worker | null> | undefined
const jobs: Array<() => Promise<void>> = []
let processing = false

function abortReason(signal: AbortSignal) {
    return signal.reason ?? new DOMException("Raster request was aborted", "AbortError")
}

function checkAbort(signal: AbortSignal): void {
    if (signal.aborted) throw abortReason(signal)
}

export function releaseRaster(raster: RasterSource | null): void {
    if (!raster) return
    if ("close" in raster) raster.close()
    else {
        raster.width = 0
        raster.height = 0
    }
}

/** Serialize full-size raster work and discard jobs as soon as they become obsolete. */
export function renderRaster(request: RasterRequest, signal: AbortSignal): Promise<RasterSource> {
    return new Promise((resolve, reject) => {
        checkAbort(signal)

        const abort = () => {
            const queued = jobs.indexOf(run)
            if (queued !== -1) jobs.splice(queued, 1)
            reject(abortReason(signal))
        }
        const run = async () => {
            try {
                const result = await render(request, signal)
                if (signal.aborted) releaseRaster(result)
                else resolve(result)
            } catch (error) {
                reject(error)
            } finally {
                signal.removeEventListener("abort", abort)
            }
        }

        signal.addEventListener("abort", abort, { once: true })
        jobs.push(run)
        void processQueue()
    })
}

async function processQueue() {
    if (processing) return
    processing = true
    for (let run = jobs.shift(); run; run = jobs.shift()) await run()
    processing = false
}

async function render(request: RasterRequest, signal: AbortSignal): Promise<RasterSource> {
    workerStartup ??= startWorker()
    const worker = await workerStartup
    checkAbort(signal)

    if (worker) {
        const sources =
            request.kind === "slider" ? [request.imageA, request.imageB] : [request.image]
        const snapshots = await Promise.allSettled(
            sources.map(async (source) => createImageBitmap(source)),
        )
        const bitmaps = snapshots.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
        )
        const failure = snapshots.find((result) => result.status === "rejected")
        try {
            checkAbort(signal)
            if (failure) throw failure.reason
        } catch (error) {
            bitmaps.forEach(releaseRaster)
            throw error
        }

        const job =
            request.kind === "slider"
                ? { ...request, imageA: bitmaps[0], imageB: bitmaps[1] }
                : { ...request, image: bitmaps[0] }
        try {
            return await sendJob(worker, job, bitmaps, signal)
        } catch (error) {
            if (signal.aborted || !(error instanceof WorkerUnavailable)) throw error
            worker.terminate()
            workerStartup = Promise.resolve(null)
        }
    }

    checkAbort(signal)
    const canvas = document.createElement("canvas")
    try {
        drawRaster(request, canvas)
        return canvas
    } catch (error) {
        releaseRaster(canvas)
        throw error
    }
}

function startWorker(): Promise<Worker | null> {
    if (typeof Worker !== "function" || typeof createImageBitmap !== "function") {
        return Promise.resolve(null)
    }

    let worker: Worker
    try {
        worker = new Worker(new URL("./raster.worker.ts", import.meta.url), { type: "module" })
    } catch {
        return Promise.resolve(null)
    }

    return new Promise((resolve) => {
        const finish = (supported: boolean) => {
            clearTimeout(startupTimeout)
            worker.removeEventListener("message", ready)
            worker.removeEventListener("error", fail)
            worker.removeEventListener("messageerror", fail)
            if (!supported) worker.terminate()
            resolve(supported ? worker : null)
        }
        const ready = (event: MessageEvent<RasterReply>) => {
            finish(event.data.kind === "ready" && event.data.supported)
        }
        const fail = () => finish(false)
        const startupTimeout = setTimeout(fail, WORKER_STARTUP_TIMEOUT_MS)
        worker.addEventListener("message", ready)
        worker.addEventListener("error", fail)
        worker.addEventListener("messageerror", fail)
    })
}

function sendJob(
    worker: Worker,
    job: RasterJob<ImageBitmap>,
    bitmaps: ImageBitmap[],
    signal: AbortSignal,
): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
        const unsubscribe = (keepResultListener = false) => {
            signal.removeEventListener("abort", abort)
            if (!keepResultListener) worker.removeEventListener("message", message)
            worker.removeEventListener("error", unavailable)
            worker.removeEventListener("messageerror", unavailable)
        }
        const message = (event: MessageEvent<RasterReply>) => {
            unsubscribe()
            if (event.data.kind === "bitmap") {
                if (signal.aborted) releaseRaster(event.data.bitmap)
                else resolve(event.data.bitmap)
            } else if (event.data.kind === "error") reject(new Error(event.data.message))
            else reject(new WorkerUnavailable("Unexpected comparison worker response"))
        }
        const unavailable = () => {
            unsubscribe()
            reject(new WorkerUnavailable("Comparison worker stopped responding"))
        }
        const abort = () => {
            // The worker may be executing a synchronous raster or may never reply.
            // Termination lets the next request proceed. Keep the one-shot result
            // listener long enough to release any bitmap already posted back.
            unsubscribe(true)
            worker.terminate()
            workerStartup = undefined
            reject(abortReason(signal))
        }
        signal.addEventListener("abort", abort, { once: true })
        worker.addEventListener("message", message, { once: true })
        worker.addEventListener("error", unavailable)
        worker.addEventListener("messageerror", unavailable)
        try {
            worker.postMessage(job, bitmaps)
        } catch (error) {
            unsubscribe()
            bitmaps.forEach(releaseRaster)
            reject(new WorkerUnavailable("Could not transfer comparison inputs", { cause: error }))
        }
    })
}
