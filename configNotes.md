
// should be displayed as ### x ###
height: number
width: number

numFrames: number

// should be displayed as ######### (Seedmode)
seed: number
seedMode: number

model: string
// will be from 0-1, should be displayed as ###.#%
strength: number

// don't worry about these yet
controls: any[]
loras: any[]

? refinerModel: string
// will be from 0-1, should be displayed as ###.#%
refinerStart: number* 

steps: number

// use getSampler()
sampler: number
// only show if sampler=tcd, "TCD (##%)"
stochasticSamplingGamma: number

// display as ##.#
guidanceScale: number

// display as #.##
shift: number 
// only show if resolutionDependentShift=true, #.## (Res. Dependent)
resolutionDependentShift: boolean

// display as ##.#
maskBlur: number

// display as ##
maskBlurOutset: number

// display as ##.#
sharpness: number

// only show guidance embed if speedUpWithGuidanceEmbed=false
? speedUpWithGuidanceEmbed: boolean
guidanceEmbed: number

// display as True (##-##)
? causalInferenceEnabled: boolean
causalInference: number
causalInferencePad: number

// display as True (## steps)
? cfgZeroStar: boolean
cfgZeroInitSteps: number

// display as ### x ### (### overlap)
? tiledDecoding: boolean
decodingTileHeight: number
decodingTileOverlap: number
decodingTileWidth: number

// display as ### x ### (### overlap)
? tiledDiffusion: boolean
diffusionTileHeight: number
diffusionTileOverlap: number
diffusionTileWidth: number

// display as ### x ### at ##%
? hiresFix: boolean
hiresFixHeight: number
hiresFixStrength: number
hiresFixWidth: number

? separateClipL: boolean
clipLText: string

? separateOpenClipG: boolean
openClipGText: string

? separateT5: boolean
t5Text: string

? teaCache: boolean
teaCacheEnd: number
teaCacheMaxSkipSteps: number
teaCacheStart: number
teaCacheThreshold: number

? upscaler: string
upscalerScaleFactor?: number

// ignore
t5TextEncoder: boolean
negativeOriginalImageHeight: number
negativeOriginalImageWidth: number
originalImageHeight: number
originalImageWidth: number
targetImageHeight: number
targetImageWidth: number
cropLeft: number
cropTop: number
preserveOriginalAfterInpaint: boolean
clipSkip: number
batchCount: number
batchSize: number
zeroNegativePrompt: boolean


// ignore/deprecated
fps: number
guidingFrameNoise: number
id: number
imageGuidanceScale: number
imagePriorSteps: number
motionScale: number
negativePromptForImagePrior: boolean
stage2Guidance: number
stage2Shift: number
stage2Steps: number
startFrameGuidance: number
negativeAestheticScore: number
aestheticScore: number
clipWeight: number
condAug: number
motionBucketId: number
