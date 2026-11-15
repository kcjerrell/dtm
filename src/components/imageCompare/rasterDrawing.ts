import {
    type CompareBrightnessOptions,
    type CompareColorOptions,
    type CompareDifferenceOptions,
    compareBrightness,
    compareColor,
    compareDifference,
    type RasterCanvas,
    type RasterImage,
} from "./compareImages"
import { applyEdgeMask } from "./edgeMask"

export type RasterJob<Image extends RasterImage> =
    | {
          kind: "slider"
          effect: "brightness" | "color" | "difference"
          imageA: Image
          imageB: Image
          options: CompareBrightnessOptions & CompareColorOptions & CompareDifferenceOptions
      }
    | {
          kind: "edges"
          image: Image
          width: number
          height: number
          upscale: number
      }

export type RasterReply =
    | { kind: "ready"; supported: boolean }
    | { kind: "bitmap"; bitmap: ImageBitmap }
    | { kind: "error"; message: string }

const compare = {
    brightness: compareBrightness,
    color: compareColor,
    difference: compareDifference,
}

export function drawRaster(job: RasterJob<RasterImage>, canvas: RasterCanvas): void {
    if (job.kind === "slider") {
        compare[job.effect](job.imageA, job.imageB, canvas, job.options)
        return
    }

    canvas.width = job.width
    canvas.height = job.height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Could not get a 2D context for alignment edges")

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(job.image, 0, 0, job.width, job.height)
    const pixels = context.getImageData(0, 0, job.width, job.height)
    applyEdgeMask(pixels, job.upscale)
    context.putImageData(pixels, 0, 0)
}
