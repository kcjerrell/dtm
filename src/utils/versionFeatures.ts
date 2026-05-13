import { DrawThingsConfig, DrawThingsMetaData } from "@/types"

const data: VersionData = {
    versions: [
        {
            version: "auraflow",
            features: ["cfgZero"],
        },
        {
            version: "flux1",
            features: [
                "cfgZero",
                "resolutionDependentShift",
                "zeroNegativePrompt",
                "separateClipL",
                "guidanceEmbed",
                "teaCache",
            ],
        },
        {
            version: "flux2",
            features: ["cfgZero", "guidanceEmbed", "resolutionDependentShift"],
        },
        {
            version: "flux2_4b",
            features: ["cfgZero", "resolutionDependentShift"],
        },
        {
            version: "flux2_9b",
            features: ["resolutionDependentShift", "cfgZero"],
        },
        {
            version: "hidream_i1",
            features: [
                "cfgZero",
                "resolutionDependentShift",
                "zeroNegativePrompt",
                "separateClipL",
                "guidanceEmbed",
                "separateOpenClipG",
                "separateT5Text",
            ],
        },
        {
            version: "hunyuan_video",
            features: ["cfgZero", "numFrames", "compressionArtifacts", "teaCache", "guidanceEmbed"],
        },
        {
            version: "kandinsky2.1",
            features: ["deprecated"],
        },
        {
            version: "ltx2",
            features: ["cfgZero", "numFrames", "compressionArtifacts"],
        },
        {
            version: "ltx2.3",
            features: [],
        },
        {
            version: "pixart",
            features: ["zeroNegativePrompt"],
        },
        {
            version: "qwen_image",
            features: ["cfgZero", "resolutionDependentShift"],
        },
        {
            version: "sd3",
            features: [
                "cfgZero",
                "resolutionDependentShift",
                "zeroNegativePrompt",
                "separateClipL",
                "t5TextEncoder",
                "separateOpenClipG",
            ],
        },
        {
            version: "sd3_large",
            features: [
                "cfgZero",
                "resolutionDependentShift",
                "zeroNegativePrompt",
                "separateClipL",
                "separateOpenClipG",
                "t5TextEncoder",
            ],
        },
        {
            version: "sdxl_base_v0.9",
            features: ["zeroNegativePrompt", "sdxlSize"],
        },
        {
            version: "sdxl_refiner_v0.9",
            features: ["zeroNegativePrompt", "sdxlSize"],
        },
        {
            version: "ssd_1b",
            features: ["zeroNegativePrompt"],
        },
        {
            version: "svd_i2v",
            features: ["numFrames", "svdOptions"],
        },
        {
            version: "v1",
            features: [],
        },
        {
            version: "v2",
            features: [],
        },
        {
            version: "wan_v2.1_1.3b",
            features: [
                "numFrames",
                "cfgZero",
                "causalInference",
                "compressionArtifacts",
                "teaCache",
            ],
        },
        {
            version: "wan_v2.1_14b",
            features: [
                "numFrames",
                "compressionArtifacts",
                "cfgZero",
                "causalInference",
                "teaCache",
            ],
        },
        {
            version: "wan_v2.2_5b",
            features: ["numFrames", "cfgZero", "causalInference", "compressionArtifacts"],
        },
        {
            version: "wurstchen_v3.0_stage_c",
            features: ["deprecated"],
        },
        {
            version: "z_image",
            features: ["cfgZero", "resolutionDependentShift"],
        },
        {
            version: "ernie_image",
            features: ["cfgZero"],
        },
        {
            version: "cosmos2.5_2b",
            features: ["cfgZero", "resolutionDependentShift"],
        },
    ],
    features: {
        cfgZero: {
            condition: {
                option: "cfgZeroStar",
            },
            options: ["cfgZeroInitSteps"],
        },
        resolutionDependentShift: ["resolutionDependentShift"],
        zeroNegativePrompt: ["zeroNegativePrompt"],
        separateClipL: {
            condition: {
                option: "separateClipL",
            },
            options: ["clipLText"],
        },
        guidanceEmbed: {
            condition: {
                option: "speedUpWithGuidanceEmbed",
                values: [false],
            },
            options: ["guidanceEmbed"],
        },
        teaCache: {
            condition: {
                option: "teaCache",
            },
            options: ["teaCacheEnd", "teaCacheMaxSkipSteps", "teaCacheStart", "teaCacheThreshold"],
        },
        separateOpenClipG: {
            condition: {
                option: "separateOpenClipG",
            },
            options: ["openClipGText"],
        },
        separateT5: {
            condition: {
                option: "separateT5",
            },
            options: ["t5Text"],
        },
        t5TextEncoder: ["t5TextEncoder"],
        numFrames: ["numFrames"],
        compressionArtifacts: {
            condition: {
                option: "compressionArtifacts",
            },
            options: ["compressionArtifactsQuality"],
        },
        causalInference: {
            condition: {
                option: "causalInference",
            },
            options: ["causalInferencePad"],
        },
        svdOptions: ["fps", "guidingFrameNoise", "motionScale", "startFrameGuidance"],
        sdxlSize: [
            "cropLeft",
            "cropTop",
            "negativeOriginalImageHeight",
            "negativeOriginalImageWidth",
            "originalImageHeight",
            "originalImageWidth",
            "targetImageHeight",
            "targetImageWidth",
        ],
    },
    conditional: {
        tiledDecoding: {
            condition: {
                option: "tiledDecoding",
            },
            options: ["decodingTileHeight", "decodingTileOverlap", "decodingTileWidth"],
        },
        tiledDiffusion: {
            condition: {
                option: "tiledDiffusion",
            },
            options: ["diffusionTileHeight", "diffusionTileOverlap", "diffusionTileWidth"],
        },
        hiresFix: {
            condition: {
                option: "hiresFix",
            },
            options: ["hiresFixHeight", "hiresFixStrength", "hiresFixWidth"],
        },
        refiner: {
            condition: {
                option: "refinerModel",
            },
            options: ["refinerStart"],
        },
        upscaler: {
            condition: {
                option: "upscalerModel",
            },
            options: ["upscalerScaleFactor"],
        },
        tcd: {
            condition: {
                option: "sampler",
                values: ["TCD", "TCDTrailing"],
            },
            options: ["stochasticSamplingGamma"],
        },
    },
    common: [
        "clipSkip",
        "controls",
        "guidanceScale",
        "height",
        "hiresFix",
        "loras",
        "maskBlur",
        "maskBlurOutset",
        "model",
        "preserveOriginalAfterInpaint",
        "refinerModel",
        "sampler",
        "seed",
        "seedMode",
        "sharpness",
        "shift",
        "steps",
        "strength",
        "tiledDecoding",
        "tiledDiffusion",
        "upscalerModel",
        "width",
    ],
    unused: [
        "aestheticScore",
        "clipWeight",
        "imagePriorSteps",
        "imageGuidanceScale",
        "negativeAestheticScore",
        "negativePromptForImagePrior",
        "stage2Guidance",
        "stage2Shift",
        "stage2Steps",
    ],
}

export interface VersionData {
    versions: Version[]
    features: FeatureMap
    conditional: Record<string, ConditionalProperties>
    common: ConfigPropertyName[]
    unused: ConfigPropertyName[]
}

export type PropertyValue = string | number | boolean | null

export interface ConditionalProperties {
    condition: Condition
    options: ConfigPropertyName[]
}

export interface Condition {
    option: PropertyValue
    values?: PropertyValue[]
}

export type FeatureMap = Record<string, FeatureDescription>
export type FeatureDescription = ConfigPropertyName | ConfigPropertyName[] | ConditionalProperties

export interface Version {
    version: string
    features: string[]
}

type ConfigPropertyName = keyof DrawThingsConfig
