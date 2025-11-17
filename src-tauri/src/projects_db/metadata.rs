use serde_json::{json, Value};

use crate::projects_db::tensor_history::TensorHistoryNode;

pub fn build_drawthings_json(node: &TensorHistoryNode) -> Value {
    // Sampler name map (example — adjust to your actual sampler IDs)
    let sampler_name = match node.sampler {
        0 => "Euler",
        1 => "Euler a",
        2 => "DPM++ 2M",
        17 => "UniPC Trailing",
        _ => "Unknown",
    };

    // Build "control" section
    let control_json = node.controls.as_ref().map(|controls| {
        controls
            .iter()
            .map(|c| {
                json!({
                    "file": c.file,  // or c.file depending on your struct
                    "weight": c.weight,
                    "guidance_start": c.guidance_start,
                    "guidance_end": c.guidance_end,
                    "no_prompt": c.no_prompt,
                })
            })
            .collect::<Vec<_>>()
    });

    // Build "lora" section
    let lora_json = node.loras.as_ref().map(|loras| {
        loras
            .iter()
            .map(|l| {
                json!({
                    "model": l.file,
                    "weight": l.weight,
                })
            })
            .collect::<Vec<_>>()
    });

    // Build V2 subsection
    let v2 = json!({
        "aestheticScore": node.aesthetic_score,
        "negativeAestheticScore": node.negative_aesthetic_score,
        "batchCount": node.batch_size,
        "batchSize": 1,
        "clipSkip": node.clip_skip,
        "clipLText": node.clip_l_text,
        "clipWeight": node.clip_weight,
        "height": node.start_height,
        "width": node.start_width,
        "guidanceScale": node.guidance_scale,
        "shift": node.shift,
        "seed": node.seed,
        "steps": node.steps,
        "strength": node.strength,
        "model": node.model,
        "maskBlur": node.mask_blur,
        "maskBlurOutset": node.mask_blur_outset,
        "imageGuidanceScale": node.image_guidance_scale,
        "guidanceEmbed": node.guidance_embed,
        "sampler": node.sampler,
        "seedMode": node.seed_mode,
        "fps": node.fps_id,
        "motionScale": node.motion_bucket_id,
        "zeroNegativePrompt": node.zero_negative_prompt,
        "resolutionDependentShift": node.resolution_dependent_shift,
        "startFrameGuidance": node.start_frame_cfg,
        "t5TextEncoder": node.t5_text_encoder,
        "separateClipL": node.separate_clip_l,
        "separateOpenClipG": node.separate_open_clip_g,
        "speedUpWithGuidanceEmbed": node.speed_up_with_guidance_embed,
        "stochasticSamplingGamma": node.stochastic_sampling_gamma,
        "preserveOriginalAfterInpaint": node.preserve_original_after_inpaint,
        "tiledDecoding": node.tiled_decoding,
        "tiledDiffusion": node.tiled_diffusion,
        "diffusionTileWidth": node.diffusion_tile_width,
        "diffusionTileHeight": node.diffusion_tile_height,
        "diffusionTileOverlap": node.diffusion_tile_overlap,
        "decodingTileWidth": node.decoding_tile_width,
        "decodingTileHeight": node.decoding_tile_height,
        "decodingTileOverlap": node.decoding_tile_overlap,
        "upscalerScaleFactor": node.upscaler_scale_factor,
        "loras": node.loras.as_ref().map(|l| {
            l.iter().map(|x| json!({
                "file": x.file,
                "weight": x.weight,
                "mode": "all"
            })).collect::<Vec<_>>()
        }),
        "controls": node.controls.as_ref().map(|controls| {
            controls.iter().map(|c| json!({
                "file": c.file,
                "weight": c.weight,
                "guidanceStart": c.guidance_start,
                "guidanceEnd": c.guidance_end,
                "downSamplingRate": 1,
                "globalAveragePooling": false,
                "inputOverride": "pose",
                "noPrompt": c.no_prompt,
                "controlImportance": "balanced",
                "targetBlocks": []
            })).collect::<Vec<_>>()
        }),
    });

    // Full top-level DT JSON
    json!({
        "c": node.text_prompt.clone().unwrap_or_default(),
        "uc": node.negative_text_prompt.clone().unwrap_or_default(),
        "seed": node.seed,
        "steps": node.steps,
        "scale": node.guidance_scale,
        "strength": node.strength,
        "shift": node.shift,
        "sampler": sampler_name,
        "clip_skip": node.clip_skip,
        "mask_blur": node.mask_blur,
        "model": node.model,
        "size": format!("{}x{}", node.start_width, node.start_height),
        "control": control_json,
        "lora": lora_json,
        "v2": v2
    })
}