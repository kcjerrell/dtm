use num_enum::TryFromPrimitive;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::{json, Value};

use crate::projects_db::tensor_history::TensorHistoryNode;
/// represents the draw things metadata as it is stored in image metadata.
/// contains mostly data from TensorHistoryNode
#[derive(Debug, Serialize, Deserialize)]
pub struct DrawThingsMetadata {
    /// positive prompt
    pub c: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<Value>,
    pub sampler: Sampler,
    #[serde(serialize_with = "serialize_float_f64")]
    pub scale: f64,
    pub seed: u32,
    pub seed_mode: SeedMode,
    #[serde(serialize_with = "serialize_float_f64")]
    pub shift: f64,
    pub size: String,
    pub steps: u32,
    #[serde(serialize_with = "serialize_float_f64")]
    pub strength: f64,
    /// negative prompt
    pub uc: String,
    pub v2: V2,
}

impl TryFrom<&TensorHistoryNode> for DrawThingsMetadata {
    type Error = serde_json::Error;

    fn try_from(value: &TensorHistoryNode) -> Result<Self, Self::Error> {
        let v2 = V2::try_from(value)?;
        Ok(Self {
            c: value
                .text_prompt
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
            model: v2.model.clone(),
            profile: Some(json!({
                "duration": 0,
                "timings": []
            })),
            sampler: Sampler::try_from(v2.sampler).unwrap(),
            scale: v2.guidance_scale as f64,
            seed: v2.seed,
            seed_mode: SeedMode::try_from(v2.seed_mode).unwrap(),
            shift: v2.shift as f64,
            size: format!("{}x{}", v2.width, v2.height),
            steps: v2.steps,
            strength: v2.strength as f64,
            uc: value
                .negative_text_prompt
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
            v2,
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V2 {
    #[serde(serialize_with = "serialize_float")]
    pub aesthetic_score: f32,
    pub batch_count: u32,
    pub batch_size: u32,
    pub causal_inference: i32,
    pub causal_inference_pad: i32,
    pub cfg_zero_init_steps: i32,
    pub cfg_zero_star: bool,
    pub clip_l_text: Option<String>,
    pub clip_skip: u32,
    #[serde(serialize_with = "serialize_float")]
    pub clip_weight: f32,
    pub controls: Vec<Value>,
    pub crop_left: i32,
    pub crop_top: i32,
    pub decoding_tile_height: u16,   // * 64
    pub decoding_tile_overlap: u16,  // * 64
    pub decoding_tile_width: u16,    // * 64
    pub diffusion_tile_height: u16,  // * 64
    pub diffusion_tile_overlap: u16, // * 64
    pub diffusion_tile_width: u16,   // * 64
    pub fps: u32,
    #[serde(serialize_with = "serialize_float")]
    pub guidance_embed: f32,
    #[serde(serialize_with = "serialize_float")]
    pub guidance_scale: f32,
    #[serde(serialize_with = "serialize_float")]
    pub guiding_frame_noise: f32,
    pub height: u32, // x 64 from start_height
    pub hires_fix: bool,
    pub hires_fix_height: u16, // * 64
    #[serde(serialize_with = "serialize_float")]
    pub hires_fix_strength: f32,
    pub hires_fix_width: u16, // * 64
    pub id: i32,
    #[serde(serialize_with = "serialize_float")]
    pub image_guidance_scale: f32,
    pub image_prior_steps: u32,
    pub loras: Vec<Value>,
    #[serde(serialize_with = "serialize_float")]
    pub mask_blur: f32,
    pub mask_blur_outset: i32,
    pub model: String,
    pub motion_scale: u32,
    #[serde(serialize_with = "serialize_float")]
    pub negative_aesthetic_score: f32,
    pub negative_original_image_height: u32,
    pub negative_original_image_width: u32,
    pub negative_prompt_for_image_prior: bool,
    pub num_frames: u32,
    pub original_image_height: u32,
    pub original_image_width: u32,
    pub preserve_original_after_inpaint: bool,
    #[serde(serialize_with = "serialize_float")]
    pub refiner_start: f32,
    pub resolution_dependent_shift: bool,
    pub sampler: i8,
    pub seed: u32,
    pub seed_mode: i8,
    pub separate_clip_l: bool,
    pub separate_open_clip_g: bool,
    pub separate_t5: bool,
    #[serde(serialize_with = "serialize_float")]
    pub sharpness: f32,
    #[serde(serialize_with = "serialize_float")]
    pub shift: f32,
    pub speed_up_with_guidance_embed: bool,
    #[serde(serialize_with = "serialize_float")]
    pub stage2_guidance: f32,
    #[serde(serialize_with = "serialize_float")]
    pub stage2_shift: f32,
    pub stage2_steps: u32,
    #[serde(serialize_with = "serialize_float")]
    pub start_frame_guidance: f32,
    pub steps: u32,
    #[serde(serialize_with = "serialize_float")]
    pub stochastic_sampling_gamma: f32,
    #[serde(serialize_with = "serialize_float")]
    pub strength: f32,
    pub t5_text_encoder: bool,
    pub target_image_height: u32,
    pub target_image_width: u32,
    pub tea_cache: bool,
    pub tea_cache_end: i32,
    pub tea_cache_max_skip_steps: i32,
    pub tea_cache_start: i32,
    #[serde(serialize_with = "serialize_float")]
    pub tea_cache_threshold: f32, //
    pub tiled_decoding: bool,
    pub tiled_diffusion: bool,
    pub upscaler_scale_factor: u8,
    pub width: u32, // * 64 from start_width
    pub zero_negative_prompt: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refiner_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upscaler: Option<String>,
}

pub fn serialize_float<S>(x: &f32, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if x.fract() == 0.0 {
        s.serialize_i64(*x as i64)
    } else {
        s.serialize_f32(*x)
    }
}

pub fn serialize_float_f64<S>(x: &f64, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if x.fract() == 0.0 {
        s.serialize_i64(*x as i64)
    } else {
        s.serialize_f64(*x)
    }
}

impl TryFrom<&TensorHistoryNode> for V2 {
    type Error = serde_json::Error;

    fn try_from(value: &TensorHistoryNode) -> Result<Self, Self::Error> {
        Ok(V2 {
            aesthetic_score: value.aesthetic_score,
            batch_count: 1,
            batch_size: value.batch_size,
            causal_inference: value.causal_inference,
            causal_inference_pad: value.causal_inference_pad,
            cfg_zero_init_steps: value.cfg_zero_init_steps,
            cfg_zero_star: value.cfg_zero_star,
            clip_l_text: value.clip_l_text.clone(),
            clip_skip: value.clip_skip,
            clip_weight: value.clip_weight,
            controls: value
                .controls
                .as_ref()
                .map(|controls| {
                    controls
                        .iter()
                        .map(|c| {
                            json!({
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
                            })
                        })
                        .collect()
                })
                .unwrap_or(Vec::new()),
            crop_left: value.crop_left * 64,
            crop_top: value.crop_top * 64,
            decoding_tile_height: value.decoding_tile_height * 64,
            decoding_tile_overlap: value.decoding_tile_overlap * 64,
            decoding_tile_width: value.decoding_tile_width * 64,
            diffusion_tile_height: value.diffusion_tile_height * 64,
            diffusion_tile_overlap: value.diffusion_tile_overlap * 64,
            diffusion_tile_width: value.diffusion_tile_width * 64,
            fps: value.fps_id, // TODO CHECK
            guidance_embed: value.guidance_embed,
            guidance_scale: value.guidance_scale,
            guiding_frame_noise: value.cond_aug,
            height: (value.start_height * 64) as u32,
            hires_fix: value.hires_fix,
            hires_fix_height: (value.hires_fix_start_height * 64) as u16,
            hires_fix_strength: value.hires_fix_strength,
            hires_fix_width: (value.hires_fix_start_width * 64) as u16,
            id: 0,
            image_guidance_scale: value.image_guidance_scale,
            image_prior_steps: value.image_prior_steps,
            loras: value
                .loras
                .as_ref()
                .map(|l| {
                    l.iter()
                        .map(|x| {
                            json!({
                                "file": x.file,
                                "weight": x.weight,
                                "mode": "all"
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or(Vec::new()),
            mask_blur: value.mask_blur,
            mask_blur_outset: value.mask_blur_outset,
            model: value.model.clone().unwrap_or("".to_string()),
            motion_scale: value.motion_bucket_id,
            negative_aesthetic_score: value.negative_aesthetic_score,
            negative_original_image_height: value.negative_original_image_height,
            negative_original_image_width: value.negative_original_image_width,
            negative_prompt_for_image_prior: value.negative_prompt_for_image_prior,
            num_frames: value.num_frames,
            original_image_height: value.original_image_height,
            original_image_width: value.original_image_width,
            preserve_original_after_inpaint: value.preserve_original_after_inpaint,
            refiner_model: value.refiner_model.clone(),
            refiner_start: value.refiner_start,
            resolution_dependent_shift: value.resolution_dependent_shift,
            sampler: value.sampler,
            seed: value.seed,
            seed_mode: value.seed_mode,
            separate_clip_l: value.separate_clip_l,
            separate_open_clip_g: value.separate_open_clip_g,
            separate_t5: value.separate_t5,
            sharpness: value.sharpness,
            shift: value.shift,
            speed_up_with_guidance_embed: value.speed_up_with_guidance_embed,
            stage2_guidance: value.stage_2_cfg,
            stage2_shift: value.stage_2_shift,
            stage2_steps: value.stage_2_steps,
            start_frame_guidance: value.start_frame_cfg,
            steps: value.steps,
            stochastic_sampling_gamma: value.stochastic_sampling_gamma,
            strength: value.strength,
            t5_text_encoder: value.t5_text_encoder,
            target_image_height: value.target_image_height,
            target_image_width: value.target_image_width,
            tea_cache: value.tea_cache,
            tea_cache_end: value.tea_cache_end,
            tea_cache_max_skip_steps: value.tea_cache_max_skip_steps,
            tea_cache_start: value.tea_cache_start,
            tea_cache_threshold: value.tea_cache_threshold,
            tiled_decoding: value.tiled_decoding,
            tiled_diffusion: value.tiled_diffusion,
            upscaler: value.upscaler.clone(),
            upscaler_scale_factor: value.upscaler_scale_factor,
            width: (value.start_width * 64) as u32,
            zero_negative_prompt: value.zero_negative_prompt,
        })
    }
}

use std::fmt;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TryFromPrimitive)]
#[repr(i8)]
pub enum SeedMode {
    #[serde(rename = "Legacy")]
    Legacy = 0,
    #[serde(rename = "Torch CPU Compatible")]
    TorchCpuCompatible = 1,
    #[serde(rename = "Scale Alike")]
    ScaleAlike = 2,
    #[serde(rename = "Nvidia GPU Compatible")]
    NvidiaGpuCompatible = 3,
}

impl fmt::Display for SeedMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            SeedMode::Legacy => "Legacy",
            SeedMode::TorchCpuCompatible => "Torch CPU Compatible",
            SeedMode::ScaleAlike => "Scale Alike",
            SeedMode::NvidiaGpuCompatible => "Nvidia GPU Compatible",
        };
        write!(f, "{}", s)
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TryFromPrimitive)]
#[repr(i8)]
pub enum Sampler {
    #[serde(rename = "Unknown")]
    Unknown = -1,
    #[serde(rename = "DPM++ 2M Karras")]
    DPMPP2MKarras = 0,
    #[serde(rename = "Euler Ancestral")]
    EulerA = 1,
    #[serde(rename = "DDIM")]
    DDIM = 2,
    #[serde(rename = "PLMS")]
    PLMS = 3,
    #[serde(rename = "DPM++ SDE Karras")]
    DPMPPSDEKarras = 4,
    #[serde(rename = "UniPC")]
    UniPC = 5,
    #[serde(rename = "LCM")]
    LCM = 6,
    #[serde(rename = "Euler A Substep")]
    EulerASubstep = 7,
    #[serde(rename = "DPM++ SDE Substep")]
    DPMPPSDESubstep = 8,
    #[serde(rename = "TCD")]
    TCD = 9,
    #[serde(rename = "Euler A Trailing")]
    EulerATrailing = 10,
    #[serde(rename = "DPM++ SDE Trailing")]
    DPMPPSDETrailing = 11,
    #[serde(rename = "DPM++ 2M AYS")]
    DPMPP2MAYS = 12,
    #[serde(rename = "Euler A AYS")]
    EulerAAYS = 13,
    #[serde(rename = "DPM++ SDE AYS")]
    DPMPPSDEAYS = 14,
    #[serde(rename = "DPM++ 2M Trailing")]
    DPMPP2MTrailing = 15,
    #[serde(rename = "DDIM Trailing")]
    DDIMTrailing = 16,
    #[serde(rename = "UniPC Trailing")]
    UniPCTrailing = 17,
    #[serde(rename = "UniPC AYS")]
    UniPCAYS = 18,
}

impl fmt::Display for Sampler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Sampler::Unknown => "Unknown",
            Sampler::DPMPP2MKarras => "DPM++ 2M Karras",
            Sampler::EulerA => "Euler Ancestral",
            Sampler::DDIM => "DDIM",
            Sampler::PLMS => "PLMS",
            Sampler::DPMPPSDEKarras => "DPM++ SDE Karras",
            Sampler::UniPC => "UniPC",
            Sampler::LCM => "LCM",
            Sampler::EulerASubstep => "Euler A Substep",
            Sampler::DPMPPSDESubstep => "DPM++ SDE Substep",
            Sampler::TCD => "TCD",
            Sampler::EulerATrailing => "Euler A Trailing",
            Sampler::DPMPPSDETrailing => "DPM++ SDE Trailing",
            Sampler::DPMPP2MAYS => "DPM++ 2M AYS",
            Sampler::EulerAAYS => "Euler A AYS",
            Sampler::DPMPPSDEAYS => "DPM++ SDE AYS",
            Sampler::DPMPP2MTrailing => "DPM++ 2M Trailing",
            Sampler::DDIMTrailing => "DDIM Trailing",
            Sampler::UniPCTrailing => "UniPC Trailing",
            Sampler::UniPCAYS => "UniPC AYS",
        };
        write!(f, "{}", s)
    }
}
