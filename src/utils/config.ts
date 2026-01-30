import type { TensorHistoryNode } from "@/generated/types"
import { type DrawThingsConfigGrouped, type DrawThingsMetaData, SeedModeLabels } from "@/types"

export function extractConfigFromTensorHistoryNode(
    node: MaybeReadonly<TensorHistoryNode> | undefined | null,
): DrawThingsMetaData["config"] | null {
    if (!node) return null
    return {
        aestheticScore: node.aesthetic_score,
        batchCount: 1, // Defaulting to 1 as it's not in TensorHistoryNode
        batchSize: node.batch_size,
        causalInference: node.causal_inference,
        causalInferencePad: node.causal_inference_pad,
        cfgZeroInitSteps: node.cfg_zero_init_steps,
        cfgZeroStar: node.cfg_zero_star,
        clipLText: node.clip_l_text ?? "",
        clipSkip: node.clip_skip,
        clipWeight: node.clip_weight,
        controls: node.controls ?? [],
        cropLeft: node.crop_left,
        cropTop: node.crop_top,
        decodingTileHeight: node.decoding_tile_height * 64,
        decodingTileOverlap: node.decoding_tile_overlap * 64,
        decodingTileWidth: node.decoding_tile_width * 64,
        diffusionTileHeight: node.diffusion_tile_height * 64,
        diffusionTileOverlap: node.diffusion_tile_overlap * 64,
        diffusionTileWidth: node.diffusion_tile_width * 64,
        fps: node.fps_id, // Assuming fps_id maps to fps
        guidanceEmbed: node.guidance_embed,
        guidanceScale: node.guidance_scale,
        guidingFrameNoise: node.cond_aug,
        height: node.start_height * 64,
        hiresFix: node.hires_fix,
        hiresFixHeight: node.hires_fix_start_height * 64,
        hiresFixStrength: node.hires_fix_strength,
        hiresFixWidth: node.hires_fix_start_width * 64,
        id: node.tensor_id,
        imageGuidanceScale: node.image_guidance_scale,
        imagePriorSteps: node.image_prior_steps,
        loras: (node.loras as any) ?? [], // Casting to any to avoid type mismatch with ObjectConstructor[][]
        maskBlur: node.mask_blur,
        maskBlurOutset: node.mask_blur_outset,
        model: node.model ?? "",
        motionScale: node.motion_bucket_id,
        negativeAestheticScore: node.negative_aesthetic_score,
        negativeOriginalImageHeight: node.negative_original_image_height,
        negativeOriginalImageWidth: node.negative_original_image_width,
        negativePromptForImagePrior: node.negative_prompt_for_image_prior,
        numFrames: node.num_frames,
        openClipGText: node.open_clip_g_text ?? null,
        originalImageHeight: node.original_image_height,
        originalImageWidth: node.original_image_width,
        preserveOriginalAfterInpaint: node.preserve_original_after_inpaint,
        refinerModel: node.refiner_model ?? null,
        refinerStart: node.refiner_start,
        resolutionDependentShift: node.resolution_dependent_shift,
        sampler: node.sampler,
        seed: node.seed,
        seedMode: node.seed_mode,
        separateClipL: node.separate_clip_l,
        separateOpenClipG: node.separate_open_clip_g,
        separateT5: node.separate_t5,
        sharpness: node.sharpness,
        shift: node.shift,
        speedUpWithGuidanceEmbed: node.speed_up_with_guidance_embed,
        stage2Guidance: node.stage_2_cfg,
        stage2Shift: node.stage_2_shift,
        stage2Steps: node.stage_2_steps,
        startFrameGuidance: node.start_frame_cfg,
        steps: node.steps,
        stochasticSamplingGamma: node.stochastic_sampling_gamma,
        strength: node.strength,
        t5Text: node.t5_text ?? null,
        t5TextEncoder: node.t5_text_encoder,
        targetImageHeight: node.target_image_height,
        targetImageWidth: node.target_image_width,
        teaCache: node.tea_cache,
        teaCacheEnd: node.tea_cache_end,
        teaCacheMaxSkipSteps: node.tea_cache_max_skip_steps,
        teaCacheStart: node.tea_cache_start,
        teaCacheThreshold: node.tea_cache_threshold,
        tiledDecoding: node.tiled_decoding,
        tiledDiffusion: node.tiled_diffusion,
        upscalerModel: node.upscaler ?? null,
        upscalerScaleFactor: node.upscaler_scale_factor,
        width: node.start_width * 64,
        zeroNegativePrompt: node.zero_negative_prompt,
    }
}

export function groupConfigProperties(
    config?: Partial<DrawThingsMetaData["config"]> | null,
): DrawThingsConfigGrouped | undefined {
    if (!config) return

    const {
        tiledDecoding,
        decodingTileWidth,
        decodingTileHeight,
        decodingTileOverlap,
        width,
        height,
        shift,
        resolutionDependentShift,
        seed,
        seedMode,
        hiresFix,
        hiresFixWidth,
        hiresFixHeight,
        hiresFixStrength,
        tiledDiffusion,
        diffusionTileWidth,
        diffusionTileHeight,
        diffusionTileOverlap,
        teaCache,
        teaCacheStart,
        teaCacheEnd,
        teaCacheThreshold,
        teaCacheMaxSkipSteps,
        stage2Guidance,
        stage2Shift,
        stage2Steps,
        originalImageWidth,
        originalImageHeight,
        targetImageWidth,
        targetImageHeight,
        negativeOriginalImageWidth,
        negativeOriginalImageHeight,
        maskBlur,
        maskBlurOutset,
        causalInference,
        causalInferencePad,
        cfgZeroInitSteps,
        cfgZeroStar,
        cropLeft,
        cropTop,
        guidanceEmbed,
        speedUpWithGuidanceEmbed,
        aestheticScore,
        negativeAestheticScore,
        refinerModel,
        refinerStart,
        upscalerModel,
        upscalerScaleFactor,
        sampler,
        stochasticSamplingGamma,
        separateClipL,
        clipLText,
        separateOpenClipG,
        openClipGText,
        separateT5,
        t5Text,
        batchSize,
        batchCount,
        imagePriorSteps,
        negativePromptForImagePrior,
        ...rest
    } = config

    return {
        ...rest,
        tiledDecoding: {
            value: tiledDecoding,
            width: decodingTileWidth,
            height: decodingTileHeight,
            overlap: decodingTileOverlap,
        },
        size: { width, height },
        shift: {
            value: shift,
            resDependentShift: resolutionDependentShift,
        },
        seed: {
            value: seed,
            seedMode: seedMode,
        },
        hiresFix: {
            value: hiresFix,
            width: hiresFixWidth,
            height: hiresFixHeight,
            strength: hiresFixStrength,
        },
        tiledDiffusion: {
            value: tiledDiffusion,
            width: diffusionTileWidth,
            height: diffusionTileHeight,
            overlap: diffusionTileOverlap,
        },
        teaCache: {
            value: teaCache,
            start: teaCacheStart,
            end: teaCacheEnd,
            threshold: teaCacheThreshold,
            maxSkipSteps: teaCacheMaxSkipSteps,
        },
        stage2: {
            guidance: stage2Guidance,
            shift: stage2Shift,
            steps: stage2Steps,
        },
        originalSize: {
            width: originalImageWidth,
            height: originalImageHeight,
        },
        targetImageSize: {
            width: targetImageWidth,
            height: targetImageHeight,
        },
        negativeOriginalSize: {
            width: negativeOriginalImageWidth,
            height: negativeOriginalImageHeight,
        },
        maskBlur: {
            value: maskBlur,
            outset: maskBlurOutset,
        },
        causalInference: {
            value: causalInference,
            pad: causalInferencePad,
        },
        cfgZero: {
            initSteps: cfgZeroInitSteps,
            star: cfgZeroStar,
        },
        crop: { left: cropLeft, top: cropTop },
        guidanceEmbed: { value: guidanceEmbed, speedUp: speedUpWithGuidanceEmbed },
        aestheticScore: { positive: aestheticScore, negative: negativeAestheticScore },
        refiner: { model: refinerModel, start: refinerStart },
        upscaler: { value: upscalerModel, scaleFactor: upscalerScaleFactor },
        sampler: { value: sampler, stochasticSamplingGamma: stochasticSamplingGamma },
        separateClipL: { value: separateClipL, text: clipLText },
        separateOpenClipG: { value: separateOpenClipG, text: openClipGText },
        separateT5: { value: separateT5, text: t5Text },
        batch: { size: batchSize, count: batchCount },
        imagePrior: { steps: imagePriorSteps, negativePrompt: negativePromptForImagePrior },
    }
}

export const samplerLabels = [
    "DPM++ 2M Karras",
    "Euler A",
    "DDIM",
    "PLMS",
    "DPM++ SDE Karras",
    "UniPC",
    "LCM",
    "Euler A Substep",
    "DPM++ SDE Substep",
    "TCD",
    "Euler A Trailing",
    "DPM++ SDE Trailing",
    "DPM++ 2M AYS",
    "Euler A AYS",
    "DPM++ SDE AYS",
    "DPM++ 2M Trailing",
    "DDIM Trailing",
    "UniPC Trailing",
    "UniPC AYS",
]

export function getSampler(sampler?: number | string | null) {
    if (typeof sampler === "number") {
        return samplerLabels[sampler]
    }
    const parsed = parseInt(sampler ?? "", 10)
    if (!Number.isNaN(parsed)) {
        return samplerLabels[parsed]
    }
    return sampler
}

export function getSeedMode(seedMode?: number | string | null) {
    if (typeof seedMode === "number") {
        return SeedModeLabels[seedMode]
    }
    const parsed = parseInt(seedMode ?? "", 10)
    if (!Number.isNaN(parsed)) {
        return SeedModeLabels[parsed]
    }
    return seedMode
}
