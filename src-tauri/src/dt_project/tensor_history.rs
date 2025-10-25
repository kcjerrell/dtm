use crate::dt_project::tensor_history_generated::{root_as_tensor_history_node};

#[derive(serde::Serialize, Debug)]
pub struct TensorHistory {
    pub lineage: i64,
    // pub logical_time: i64,
    pub width: u16,
    pub height: u16,
    pub seed: u32,
    pub steps: u32,
    pub guidance_scale: f32,
    pub strength: f32,
    pub model: String,
    pub tensor_id: i64,
    pub mask_id: i64,
    // pub wall_clock: i64,
    // pub text_edits: i64,
    // pub text_lineage: i64,
    pub batch_size: u32,
    // pub sampler: i32,
    // pub hires_fix: bool,
    // pub hires_fix_start_width: u16,
    // pub hires_fix_start_height: u16,
    // pub hires_fix_strength: f32,
    // pub upscaler: Option<String>,
    // pub scale_factor: u16,
    // pub depth_map_id: i64,
    // pub generated: bool,
    // pub image_guidance_scale: f32,
    // pub seed_mode: i32,
    // pub clip_skip: u32,
    pub controls: Vec<String>,
    // pub scribble_id: i64,
    // pub pose_id: i64,
    pub loras: Vec<String>,
    // pub color_palette_id: i64,
    // pub mask_blur: f32,
    // pub custom_id: i64,
    // pub face_restoration: Option<String>,
    // pub decode_with_attention: bool,
    // pub hires_fix_decode_with_attention: bool,
    // pub clip_weight: f32,
    // pub negative_prompt_for_image_prior: bool,
    // pub image_prior_steps: u32,
    // pub data_stored: i32,
    pub preview_id: i64,
    // pub content_offset_x: i32,
    // pub content_offset_y: i32,
    // pub scale_factor_by_120: i32,
    pub refiner_model: Option<String>,
    // pub original_image_height: u32,
    // pub original_image_width: u32,
    // pub crop_top: i32,
    // pub crop_left: i32,
    // pub target_image_height: u32,
    // pub target_image_width: u32,
    // pub aesthetic_score: f32,
    // pub negative_aesthetic_score: f32,
    // pub zero_negative_prompt: bool,
    // pub refiner_start: f32,
    // pub negative_original_image_height: u32,
    // pub negative_original_image_width: u32,
    // pub shuffle_data_stored: i32,
    // pub fps_id: u32,
    // pub motion_bucket_id: u32,
    // pub cond_aug: f32,
    // pub start_frame_cfg: f32,
    // pub num_frames: u32,
    // pub mask_blur_outset: i32,
    // pub sharpness: f32,
    // pub shift: f32,
    // pub stage_2_steps: u32,
    // pub stage_2_cfg: f32,
    // pub stage_2_shift: f32,
    // pub tiled_decoding: bool,
    // pub decoding_tile_width: u16,
    // pub decoding_tile_height: u16,
    // pub decoding_tile_overlap: u16,
    // pub stochastic_sampling_gamma: f32,
    // pub preserve_original_after_inpaint: bool,
    // pub tiled_diffusion: bool,
    // pub diffusion_tile_width: u16,
    // pub diffusion_tile_height: u16,
    // pub diffusion_tile_overlap: u16,
    // pub upscaler_scale_factor: u8,
    // pub script_session_id: u64,
    // pub t5_text_encoder: bool,
    // pub separate_clip_l: bool,
    // pub clip_l_text: Option<String>,
    // pub separate_open_clip_g: bool,
    // pub open_clip_g_text: Option<String>,
    // pub speed_up_with_guidance_embed: bool,
    // pub guidance_embed: f32,
    // pub resolution_dependent_shift: bool,
    // pub profile_data: Vec<u8>,
    // pub tea_cache_start: i32,
    // pub tea_cache_end: i32,
    // pub tea_cache_threshold: f32,
    // pub tea_cache: bool,
    // pub separate_t5: bool,
    // pub t5_text: Option<String>,
    // pub tea_cache_max_skip_steps: i32,
    pub prompt: String,
    pub negative_prompt: String,
    pub clip_id: i64,
    // pub index_in_a_clip: i32,
    // pub causal_inference_enabled: bool,
    // pub causal_inference: i32,
    // pub causal_inference_pad: i32,
    // pub cfg_zero_star: bool,
    // pub cfg_zero_init_steps: i32,
    // pub generation_time: f64,
    // pub reason: i32,
    pub image_id: i64,
    pub row_id: i64
}

pub fn parse_tensor_history(blob: &[u8], row_id: i64, image_id: i64) -> Result<TensorHistory, String> {
    // root_as_tensor_history_node returns a table accessor borrowed from blob
    let node = root_as_tensor_history_node(blob)
        .map_err(|e| format!("flatbuffers parse error: {:?}", e))?;

    let loras: Vec<String> = node.loras()
    .map(|v| {
        v.iter()
         .filter_map(|l| l.file()) // `c.file()` returns Option<&str>
         .map(|s| s.to_string())
         .collect::<Vec<_>>()
    })
    .unwrap_or_default();

        let controls: Vec<String> = node.controls()
    .map(|v| {
        v.iter()
         .filter_map(|c| c.file()) // `c.file()` returns Option<&str>
         .map(|s| s.to_string())
         .collect::<Vec<_>>()
    })
    .unwrap_or_default();

    Ok(TensorHistory {
        seed: node.seed(),
        width: node.start_width(),
        height: node.start_height(),
        prompt: node.text_prompt().unwrap_or("").to_string(),
        negative_prompt: node.negative_text_prompt().unwrap_or("").to_string(),
        steps: node.steps(),
        batch_size: node.batch_size(),
        guidance_scale: node.guidance_scale(),
        mask_id: node.mask_id(),
        model: node.model().unwrap_or("").to_string(),
        strength: node.strength(),
        tensor_id: node.tensor_id(),
        image_id,
        lineage: node.lineage(),
        preview_id: node.preview_id(),
        clip_id: node.clip_id(),
        row_id,
        refiner_model: node.refiner_model().take().map(|s| s.to_string()),
        controls,
        loras
    })
}
