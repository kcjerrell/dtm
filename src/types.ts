import type { FileInfo } from "@tauri-apps/plugin-fs"
import type { Tags } from "exifreader"

export type DrawThingsMetaData = {
    prompt: string
    lora: {
        model: string
        weight: number
    }[]
    mask_blur: number
    model: string
    profile: {
        duration: number
        timings: {
            durations: number[]
            name: string
        }[]
    }
    sampler: string
    scale: number
    seed: number
    seed_mode: string
    shift: number
    size: string
    steps: number
    strength: number
    negativePrompt: string
    config: {
        aestheticScore: number
        batchCount: number
        batchSize: number
        causalInference: number
        causalInferencePad: number
        cfgZeroInitSteps: number
        cfgZeroStar: boolean
        clipLText: string
        clipSkip: number
        clipWeight: number
        controls: any[]
        cropLeft: number
        cropTop: number
        decodingTileHeight: number
        decodingTileOverlap: number
        decodingTileWidth: number
        diffusionTileHeight: number
        diffusionTileOverlap: number
        diffusionTileWidth: number
        fps: number
        guidanceEmbed: number
        guidanceScale: number
        guidingFrameNoise: number
        height: number
        hiresFix: boolean
        hiresFixHeight: number
        hiresFixStrength: number
        hiresFixWidth: number
        id: number
        imageGuidanceScale: number
        imagePriorSteps: number
        loras: ObjectConstructor[][]
        maskBlur: number
        maskBlurOutset: number
        model: string
        motionScale: number
        negativeAestheticScore: number
        negativeOriginalImageHeight: number
        negativeOriginalImageWidth: number
        negativePromptForImagePrior: boolean
        numFrames: number
        originalImageHeight: number
        originalImageWidth: number
        preserveOriginalAfterInpaint: boolean
        refinerModel: string | null
        refinerStart: number
        resolutionDependentShift: boolean
        sampler: number
        seed: number
        seedMode: number
        separateClipL: boolean
        separateOpenClipG: boolean
        openClipGText: string | null
        separateT5: boolean
        t5Text: string | null
        sharpness: number
        shift: number
        speedUpWithGuidanceEmbed: boolean
        stage2Guidance: number
        stage2Shift: number
        stage2Steps: number
        startFrameGuidance: number
        steps: number
        stochasticSamplingGamma: number
        strength: number
        t5TextEncoder: boolean
        targetImageHeight: number
        targetImageWidth: number
        teaCache: boolean
        teaCacheEnd: number
        teaCacheMaxSkipSteps: number
        teaCacheStart: number
        teaCacheThreshold: number
        tiledDecoding: boolean
        tiledDiffusion: boolean
        upscalerModel: string | null
        upscalerScaleFactor: number
        width: number
        zeroNegativePrompt: boolean
    }
}

export type DrawThingsConfig = Partial<DrawThingsMetaData["config"]>

type PartialPartial<T> = {
    [key in keyof T]?: Partial<T[key]>
}
export type DrawThingsConfigGrouped = PartialPartial<{
    aestheticScore: { positive: number; negative: number }
    batch: { size: number; count: number }
    causalInference: { value: number; pad: number }
    cfgZero: { initSteps: number; star: boolean }
    clipSkip: number
    clipWeight: number
    controls: any[]
    crop: { left: number; top: number }
    diffusionTileHeight: number
    diffusionTileOverlap: number
    diffusionTileWidth: number
    fps: number
    guidanceEmbed: { value: number; speedUp: boolean }
    guidanceScale: number
    guidingFrameNoise: number
    hiresFix: { value: boolean; width: number; height: number; strength: number }
    id: number
    imageGuidanceScale: number
    imagePrior: { steps: number; negativePrompt: boolean }
    imagePriorSteps: number
    loras: any[][]
    maskBlur: { value: number; outset: number }
    model: string
    motionScale: number
    numFrames: number
    originalSize: { width: number; height: number }
    negativeOriginalSize: { width: number; height: number }
    preserveOriginalAfterInpaint: boolean
    refiner: { model: string | null; start: number }
    resolutionDependentShift: boolean
    sampler: { value: number; stochasticSamplingGamma: number }
    seed: { value: number; seedMode: number }
    separateClipL: { value: boolean; text: string }
    separateOpenClipG: { value: boolean; text: string | null }
    separateT5: { value: boolean; text: string | null }
    sharpness: number
    shift: { value: number; resDependentShift: boolean }
    size: { width: number; height: number }
    speedUpWithGuidanceEmbed: boolean
    stage2: { guidance: number; shift: number; steps: number }
    startFrameGuidance: number
    steps: number
    strength: number
    t5TextEncoder: boolean
    targetImageSize: { width: number; height: number }
    teaCache: {
        value: boolean
        start: number
        end: number
        threshold: number
        maxSkipSteps: number
    }
    tiledDecoding: { value: boolean; width: number; height: number; overlap: number }
    tiledDiffusion: { value: boolean; width: number; height: number; overlap: number }
    upscaler: { value: string | null; scaleFactor: number }
    zeroNegativePrompt: boolean
}>

export type ImageMetadata = {
    info?: FileInfo
    exif?: Tags
    path?: string
    url?: string
    source?: ImageSource
}

export type ImageItem = {
    id: string
    filepath?: string
    info?: FileInfo
    exif?: ExifReader.Tags | null
    dtData?: DrawThingsMetaData | null
    url?: string
    thumbUrl?: string
    pin?: number | null
    loadedAt: number
    source: ImageSource
    type: string
}

export type ImageSource = {
    source: "drop" | "clipboard" | "open" | "project"
    file?: string
    url?: string
    image?: string
    projectFile?: string
    tensorId?: string
    nodeId?: number
    pasteboardType?: string
}
