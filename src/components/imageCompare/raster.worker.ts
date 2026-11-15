import { drawRaster, type RasterJob, type RasterReply } from "./rasterDrawing"

const scope = self as unknown as {
    onmessage: (event: MessageEvent<RasterJob<ImageBitmap>>) => void
    postMessage: (reply: RasterReply, transfer?: Transferable[]) => void
}

function supportsRasterization(): boolean {
    if (typeof OffscreenCanvas === "undefined") return false
    try {
        const canvas = new OffscreenCanvas(1, 1)
        return typeof canvas.transferToImageBitmap === "function" && !!canvas.getContext("2d")
    } catch {
        return false
    }
}

scope.onmessage = ({ data: job }) => {
    const canvas = new OffscreenCanvas(1, 1)
    try {
        drawRaster(job, canvas)
    } catch (error) {
        scope.postMessage({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
        })
        return
    } finally {
        if (job.kind === "slider") {
            job.imageA.close()
            job.imageB.close()
        } else {
            job.image.close()
        }
    }

    const bitmap = canvas.transferToImageBitmap()
    try {
        scope.postMessage({ kind: "bitmap", bitmap }, [bitmap])
    } catch (error) {
        bitmap.close()
        throw error
    }
}

scope.postMessage({ kind: "ready", supported: supportsRasterization() })
