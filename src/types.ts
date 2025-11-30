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
		refinerStart: number
		resolutionDependentShift: boolean
		sampler: number
		seed: number
		seedMode: number
		separateClipL: boolean
		separateOpenClipG: boolean
		separateT5: boolean
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
		upscalerScaleFactor: number
		width: number
		zeroNegativePrompt: boolean
	}
}

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

