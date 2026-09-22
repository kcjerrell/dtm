export interface CompareBrightnessOptions {
    /** Multiplies the perceptual difference remaining after `threshold`. */
    gain?: number
    /** Suppresses absolute OKLab lightness differences at or below this value. */
    threshold?: number
}

export interface CompareColorOptions {
    /** Multiplies the perceptual difference remaining after `threshold`. */
    gain?: number
    /** Suppresses OKLab chroma-vector magnitudes at or below this value. */
    threshold?: number
    /** Scales the chroma of the direction color. `0` is gray and `1` is the default. */
    saturation?: number
}

export interface CompareDifferenceOptions {
    /** Multiplies the perceptual difference remaining after `threshold`. */
    gain?: number
    /** Suppresses OKLab distances at or below this value. */
    threshold?: number
    /** Any CSS color accepted by CanvasRenderingContext2D.fillStyle. */
    color?: string
}

const DEFAULT_BRIGHTNESS_GAIN = 4
const DEFAULT_BRIGHTNESS_THRESHOLD = 0.005
const BRIGHTNESS_BASE_SHADE = 0x80
const BRIGHTNESS_DIFF_MIN_ALPHA = 0.7
const DEFAULT_COLOR_GAIN = 8
const DEFAULT_COLOR_THRESHOLD = 0.005
const DEFAULT_COLOR_SATURATION = 1
const DEFAULT_DIFFERENCE_GAIN = 4
const DEFAULT_DIFFERENCE_THRESHOLD = 0.01
const DEFAULT_DIFFERENCE_COLOR = "#ff2d55"

// A full alpha-only change should be visible without overpowering ordinary Lab differences.
const ALPHA_DISTANCE_WEIGHT = 0.25

// Direction colors use a fixed-lightness OKLab color wheel. Keeping chroma fixed means hue
// communicates direction while output alpha remains the only magnitude signal.
const DIRECTION_COLOR_LIGHTNESS = 0.72
const DIRECTION_COLOR_CHROMA = 0.16

interface ComparisonBuffers {
    context: CanvasRenderingContext2D
    imageA: Uint8ClampedArray
    imageB: Uint8ClampedArray
    output: ImageData
}

/**
 * Draws signed perceptual-lightness differences into `canvas`.
 *
 * Transparent gray means there is no difference. White means B is brighter, black means B is
 * darker, and opacity ramps from 70% to 100% with the fixed-scale magnitude of the difference.
 */
export function compareBrightness(
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    canvas: HTMLCanvasElement,
    opts: CompareBrightnessOptions = {},
): void {
    const {
        context,
        imageA: pixelsA,
        imageB: pixelsB,
        output,
    } = prepareComparison(imageA, imageB, canvas)
    const gain = nonnegativeOption(opts.gain, DEFAULT_BRIGHTNESS_GAIN)
    const threshold = nonnegativeOption(opts.threshold, DEFAULT_BRIGHTNESS_THRESHOLD)
    const lab = new Float64Array(8)

    for (let offset = 0; offset < output.data.length; offset += 4) {
        rgbaToVisibleOklab(pixelsA, offset, lab, 0)
        rgbaToVisibleOklab(pixelsB, offset, lab, 4)

        const delta = lab[4] - lab[0]
        const difference = clamp01(Math.max(0, Math.abs(delta) - threshold) * gain)
        const hasDifference = difference > 0
        const shade = hasDifference ? (delta > 0 ? 255 : 0) : BRIGHTNESS_BASE_SHADE
        const alpha = hasDifference
            ? Math.round(
                  (BRIGHTNESS_DIFF_MIN_ALPHA + (1 - BRIGHTNESS_DIFF_MIN_ALPHA) * difference) * 255,
              )
            : 0

        output.data[offset] = shade
        output.data[offset + 1] = shade
        output.data[offset + 2] = shade
        output.data[offset + 3] = alpha
    }

    context.putImageData(output, 0, 0)
}

/**
 * Draws chromatic shifts from A to B into `canvas`, independently of OKLab lightness.
 *
 * The normalized `(delta a, delta b)` vector is placed on a fixed-lightness OKLab color wheel:
 * +a is pink/red, -a is green, +b is yellow, and -b is blue. `saturation` scales that wheel's
 * fixed chroma, while opacity encodes the vector magnitude.
 */
export function compareColor(
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    canvas: HTMLCanvasElement,
    opts: CompareColorOptions = {},
): void {
    const {
        context,
        imageA: pixelsA,
        imageB: pixelsB,
        output,
    } = prepareComparison(imageA, imageB, canvas)
    const gain = nonnegativeOption(opts.gain, DEFAULT_COLOR_GAIN)
    const threshold = nonnegativeOption(opts.threshold, DEFAULT_COLOR_THRESHOLD)
    const saturation = nonnegativeOption(opts.saturation, DEFAULT_COLOR_SATURATION)
    const displayChroma = DIRECTION_COLOR_CHROMA * saturation
    const lab = new Float64Array(8)
    const rgb = new Float64Array(3)

    for (let offset = 0; offset < output.data.length; offset += 4) {
        rgbaToVisibleOklab(pixelsA, offset, lab, 0)
        rgbaToVisibleOklab(pixelsB, offset, lab, 4)

        const deltaA = lab[5] - lab[1]
        const deltaB = lab[6] - lab[2]
        const magnitude = Math.hypot(deltaA, deltaB)
        const alpha = differenceAlpha(magnitude, threshold, gain)

        if (alpha === 0) {
            output.data[offset] = 0
            output.data[offset + 1] = 0
            output.data[offset + 2] = 0
            output.data[offset + 3] = 0
            continue
        }

        // Normalizing the vector is equivalent to atan2 followed by cos/sin, without wrapping
        // problems or instability from subtracting two hue angles.
        const inverseMagnitude = 1 / magnitude
        oklabToSrgb(
            DIRECTION_COLOR_LIGHTNESS,
            deltaA * inverseMagnitude * displayChroma,
            deltaB * inverseMagnitude * displayChroma,
            rgb,
        )

        output.data[offset] = Math.round(rgb[0] * 255)
        output.data[offset + 1] = Math.round(rgb[1] * 255)
        output.data[offset + 2] = Math.round(rgb[2] * 255)
        output.data[offset + 3] = alpha
    }

    context.putImageData(output, 0, 0)
}

/**
 * Draws the overall perceptual difference between A and B into `canvas` using one highlight
 * color. Opacity encodes a fixed-scale OKLab distance, with an additional small contribution
 * for alpha-only changes.
 */
export function compareDifference(
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    canvas: HTMLCanvasElement,
    opts: CompareDifferenceOptions = {},
): void {
    const {
        context,
        imageA: pixelsA,
        imageB: pixelsB,
        output,
    } = prepareComparison(imageA, imageB, canvas)
    const gain = nonnegativeOption(opts.gain, DEFAULT_DIFFERENCE_GAIN)
    const threshold = nonnegativeOption(opts.threshold, DEFAULT_DIFFERENCE_THRESHOLD)
    const color = parseCssColor(context, opts.color ?? DEFAULT_DIFFERENCE_COLOR)
    const lab = new Float64Array(8)

    for (let offset = 0; offset < output.data.length; offset += 4) {
        rgbaToVisibleOklab(pixelsA, offset, lab, 0)
        rgbaToVisibleOklab(pixelsB, offset, lab, 4)

        const deltaL = lab[4] - lab[0]
        const deltaA = lab[5] - lab[1]
        const deltaB = lab[6] - lab[2]
        const deltaAlpha = (lab[7] - lab[3]) * ALPHA_DISTANCE_WEIGHT
        const difference = Math.hypot(deltaL, deltaA, deltaB, deltaAlpha)

        output.data[offset] = color[0]
        output.data[offset + 1] = color[1]
        output.data[offset + 2] = color[2]
        output.data[offset + 3] = Math.round(
            differenceAlpha(difference, threshold, gain) * (color[3] / 255),
        )
    }

    context.putImageData(output, 0, 0)
}

/**
 * Uses the union of both native image bounds. Images are top-left aligned and are not resampled;
 * pixels outside the smaller image are transparent. This preserves pixel-level correspondence
 * and exposes size differences instead of hiding them through stretching or cropping.
 */
function prepareComparison(
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    canvas: HTMLCanvasElement,
): ComparisonBuffers {
    const widthA = imageDimension(imageA.naturalWidth, imageA.width)
    const heightA = imageDimension(imageA.naturalHeight, imageA.height)
    const widthB = imageDimension(imageB.naturalWidth, imageB.width)
    const heightB = imageDimension(imageB.naturalHeight, imageB.height)
    const width = Math.max(widthA, widthB)
    const height = Math.max(heightA, heightB)

    if (width === 0 || height === 0) {
        throw new Error("Cannot compare images with empty dimensions")
    }

    // Assigning both dimensions also resets transforms, compositing, and other caller state.
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
        throw new Error("Could not get a 2D rendering context for image comparison")
    }

    context.imageSmoothingEnabled = false

    context.clearRect(0, 0, width, height)
    context.drawImage(imageA, 0, 0, widthA, heightA)
    const pixelsA = context.getImageData(0, 0, width, height).data

    context.clearRect(0, 0, width, height)
    context.drawImage(imageB, 0, 0, widthB, heightB)
    const pixelsB = context.getImageData(0, 0, width, height).data

    return {
        context,
        imageA: pixelsA,
        imageB: pixelsB,
        output: context.createImageData(width, height),
    }
}

function imageDimension(natural: number, fallback: number): number {
    return Math.max(0, Math.round(natural || fallback))
}

function nonnegativeOption(value: number | undefined, fallback: number): number {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value)
}

function differenceAlpha(difference: number, threshold: number, gain: number): number {
    return Math.round(clamp01(Math.max(0, difference - threshold) * gain) * 255)
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
}

/**
 * Converts unpremultiplied canvas RGBA to alpha-weighted OKLab. Weighting all Lab components by
 * coverage makes hidden RGB in fully transparent pixels irrelevant while retaining visible color
 * differences at partially transparent edges.
 */
function rgbaToVisibleOklab(
    rgba: Uint8ClampedArray,
    rgbaOffset: number,
    output: Float64Array,
    outputOffset: number,
): void {
    const alpha = rgba[rgbaOffset + 3] / 255
    output[outputOffset + 3] = alpha

    if (alpha === 0) {
        output[outputOffset] = 0
        output[outputOffset + 1] = 0
        output[outputOffset + 2] = 0
        return
    }

    const red = srgbToLinear(rgba[rgbaOffset] / 255)
    const green = srgbToLinear(rgba[rgbaOffset + 1] / 255)
    const blue = srgbToLinear(rgba[rgbaOffset + 2] / 255)

    // Linear sRGB -> LMS -> cube-rooted LMS -> OKLab.
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)

    output[outputOffset] = (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s) * alpha
    output[outputOffset + 1] = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * alpha
    output[outputOffset + 2] = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * alpha
}

function srgbToLinear(value: number): number {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function oklabToSrgb(lightness: number, a: number, b: number, output: Float64Array): void {
    const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
    const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
    const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
    const l = lRoot * lRoot * lRoot
    const m = mRoot * mRoot * mRoot
    const s = sRoot * sRoot * sRoot

    output[0] = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    output[1] = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    output[2] = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
}

function linearToSrgb(value: number): number {
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
    return clamp01(encoded)
}

function parseCssColor(context: CanvasRenderingContext2D, color: string): Uint8ClampedArray {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = DEFAULT_DIFFERENCE_COLOR
    context.fillStyle = color // Invalid CSS colors are ignored, leaving the default in place.
    context.fillRect(0, 0, 1, 1)
    return context.getImageData(0, 0, 1, 1).data
}
