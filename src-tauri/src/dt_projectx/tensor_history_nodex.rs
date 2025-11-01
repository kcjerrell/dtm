use rusqlite::{params, Connection, Result as SqlResult};
use serde::Serialize;

// adjust path/module name to match your generated file
mod tensor_history_generated {
    #![allow(non_snake_case, non_camel_case_types, dead_code)]
    include!("tensor_history_generated.rs");
}
use tensor_history_generated::root_as_tensor_history_node;
use tensor_history_generated::TensorHistoryNode as FB_TensorHistoryNode;

#[derive(Serialize, Debug)]
pub struct ControlOwned {
    pub file: Option<String>,
    pub weight: f32,
    pub guidance_start: f32,
    pub guidance_end: f32,
    pub no_prompt: bool,
    pub global_average_pooling: bool,
    pub down_sampling_rate: f32,
    // pub control_mode: i32,          // enum -> numeric
    pub target_blocks: Vec<String>,
    // pub input_override: i32,        // enum -> numeric
}

#[derive(Serialize, Debug)]
pub struct LoRAOwned {
    pub file: Option<String>,
    pub weight: f32,
    // pub mode: i32,                  // enum -> numeric
}

#[derive(Serialize, Debug)]
pub struct TensorHistory {
    pub lineage: i64,
    pub logical_time: i64,
    pub start_width: u16,
    pub start_height: u16,
    pub seed: u32,
    pub steps: u32,
    pub guidance_scale: f32,
    pub strength: f32,
    pub model: Option<String>,
    pub tensor_id: i64,
    pub mask_id: i64,
    pub wall_clock: i64,
    pub text_edits: i64,
    pub text_lineage: i64,
    pub batch_size: u32,
    // pub sampler: i32,
    pub hires_fix: bool,
    pub hires_fix_start_width: u16,
    pub hires_fix_start_height: u16,
    pub hires_fix_strength: f32,
    pub upscaler: Option<String>,
    pub scale_factor: u16,
    pub depth_map_id: i64,
    pub generated: bool,
    pub image_guidance_scale: f32,
    // pub seed_mode: i32,
    pub clip_skip: u32,
    pub controls: Vec<ControlOwned>,
    pub scribble_id: i64,
    pub pose_id: i64,
    pub loras: Vec<LoRAOwned>,
    pub color_palette_id: i64,
    pub mask_blur: f32,
    pub custom_id: i64,
    pub face_restoration: Option<String>,
    pub decode_with_attention: bool,
    pub hires_fix_decode_with_attention: bool,
    pub clip_weight: f32,
    pub negative_prompt_for_image_prior: bool,
    pub image_prior_steps: u32,
    pub data_stored: i32,
    pub preview_id: i64,
    pub content_offset_x: i32,
    pub content_offset_y: i32,
    pub scale_factor_by_120: i32,
    pub refiner_model: Option<String>,
    pub original_image_height: u32,
    pub original_image_width: u32,
    pub crop_top: i32,
    pub crop_left: i32,
    pub target_image_height: u32,
    pub target_image_width: u32,
    pub aesthetic_score: f32,
    pub negative_aesthetic_score: f32,
    pub zero_negative_prompt: bool,
    pub refiner_start: f32,
    pub negative_original_image_height: u32,
    pub negative_original_image_width: u32,
    pub shuffle_data_stored: i32,
    pub fps_id: u32,
    pub motion_bucket_id: u32,
    pub cond_aug: f32,
    pub start_frame_cfg: f32,
    pub num_frames: u32,
    pub mask_blur_outset: i32,
    pub sharpness: f32,
    pub shift: f32,
    pub stage_2_steps: u32,
    pub stage_2_cfg: f32,
    pub stage_2_shift: f32,
    pub tiled_decoding: bool,
    pub decoding_tile_width: u16,
    pub decoding_tile_height: u16,
    pub decoding_tile_overlap: u16,
    pub stochastic_sampling_gamma: f32,
    pub preserve_original_after_inpaint: bool,
    pub tiled_diffusion: bool,
    pub diffusion_tile_width: u16,
    pub diffusion_tile_height: u16,
    pub diffusion_tile_overlap: u16,
    pub upscaler_scale_factor: u8,
    pub script_session_id: u64,
    pub t5_text_encoder: bool,
    pub separate_clip_l: bool,
    pub clip_l_text: Option<String>,
    pub separate_open_clip_g: bool,
    pub open_clip_g_text: Option<String>,
    pub speed_up_with_guidance_embed: bool,
    pub guidance_embed: f32,
    pub resolution_dependent_shift: bool,
    pub profile_data: Vec<u8>,
    pub tea_cache_start: i32,
    pub tea_cache_end: i32,
    pub tea_cache_threshold: f32,
    pub tea_cache: bool,
    pub separate_t5: bool,
    pub t5_text: Option<String>,
    pub tea_cache_max_skip_steps: i32,
    pub text_prompt: Option<String>,
    pub negative_text_prompt: Option<String>,
    pub clip_id: i64,
    pub index_in_a_clip: i32,
    pub causal_inference_enabled: bool,
    pub causal_inference: i32,
    pub causal_inference_pad: i32,
    pub cfg_zero_star: bool,
    pub cfg_zero_init_steps: i32,
    pub generation_time: f64,
    // pub reason: i32,
}

fn opt_string(s: Option<&str>) -> Option<String> {
    s.map(|s| s.to_owned())
}

// fn vec_string_from_fb<'a>(
//     vec: Option<flatbuffers::Vector<'a, flatbuffers::ForwardsUOffset<&'a str>>>,
// ) -> Vec<String> {
//     let mut out = Vec::new();
//     if let Some(v) = vec {
//         for i in 0..v.len() {
//             if let Some(s) = v.get(i) {
//                 out.push(s.to_string());
//             }
//         }
//     }
//     out
// }

// Parse `Control` flatbuffer table into owned struct
fn parse_control<'a>(c: tensor_history_generated::Control<'a>) -> ControlOwned {
    let target_blocks = {
        let mut t = Vec::new();
        if let Some(tb) = c.target_blocks() {
            for i in 0..tb.len() {
                if let Some(s) = tb.get(i) {
                    t.push(s.to_string());
                }
            }
        }
        t
    };

    ControlOwned {
        file: c.file().map(|s| s.to_string()),
        weight: c.weight(),
        guidance_start: c.guidance_start(),
        guidance_end: c.guidance_end(),
        no_prompt: c.no_prompt(),
        global_average_pooling: c.global_average_pooling(),
        down_sampling_rate: c.down_sampling_rate(),
        // control_mode: c.control_mode() as i32,
        target_blocks,
        // input_override: c.input_override() as i32,
    }
}

fn parse_lora<'a>(l: tensor_history_generated::LoRA<'a>) -> LoRAOwned {
    LoRAOwned {
        file: l.file().map(|s| s.to_string()),
        weight: l.weight(),
        // mode: l.mode() as i32,
    }
}

/// Convert from FB bytes (FlatBuffer) to owned `TensorHistory`
pub fn parse_tensor_history(blob: &[u8]) -> Result<TensorHistory, String> {
    // root_as_tensor_history_node returns a table accessor borrowed from blob
    let node = root_as_tensor_history_node(blob)
        .map_err(|e| format!("flatbuffers parse error: {:?}", e))?;

    // controls
    let mut controls: Vec<ControlOwned> = Vec::new();
    if let Some(ctrls) = node.controls() {
        for i in 0..ctrls.len() {
            if let Some(c) = ctrls.get(i) {
                controls.push(parse_control(c));
            }
        }
    }

    // loras
    let mut loras: Vec<LoRAOwned> = Vec::new();
    if let Some(lora_vec) = node.loras() {
        for i in 0..lora_vec.len() {
            if let Some(l) = lora_vec.get(i) {
                loras.push(parse_lora(l));
            }
        }
    }

    // profile_data (vector of ubyte)
    let profile_data: Vec<u8> = match node.profile_data() {
        Some(pd) => {
            let mut v = Vec::with_capacity(pd.len());
            for i in 0..pd.len() {
                v.push(pd.get(i));
            }
            v
        }
        None => Vec::new(),
    };

    Ok(TensorHistory {
        lineage: node.lineage(),
        logical_time: node.logical_time(),
        start_width: node.start_width(),
        start_height: node.start_height(),
        seed: node.seed(),
        steps: node.steps(),
        guidance_scale: node.guidance_scale(),
        strength: node.strength(),
        model: opt_string(node.model()),
        tensor_id: node.tensor_id(),
        mask_id: node.mask_id(),
        wall_clock: node.wall_clock(),
        text_edits: node.text_edits(),
        text_lineage: node.text_lineage(),
        batch_size: node.batch_size(),
        // sampler: node.sampler() as i32,
        hires_fix: node.hires_fix(),
        hires_fix_start_width: node.hires_fix_start_width(),
        hires_fix_start_height: node.hires_fix_start_height(),
        hires_fix_strength: node.hires_fix_strength(),
        upscaler: opt_string(node.upscaler()),
        scale_factor: node.scale_factor(),
        depth_map_id: node.depth_map_id(),
        generated: node.generated(),
        image_guidance_scale: node.image_guidance_scale(),
        // seed_mode: node.seed_mode() as i32,
        clip_skip: node.clip_skip(),
        controls,
        scribble_id: node.scribble_id(),
        pose_id: node.pose_id(),
        loras,
        color_palette_id: node.color_palette_id(),
        mask_blur: node.mask_blur(),
        custom_id: node.custom_id(),
        face_restoration: opt_string(node.face_restoration()),
        decode_with_attention: node.decode_with_attention(),
        hires_fix_decode_with_attention: node.hires_fix_decode_with_attention(),
        clip_weight: node.clip_weight(),
        negative_prompt_for_image_prior: node.negative_prompt_for_image_prior(),
        image_prior_steps: node.image_prior_steps(),
        data_stored: node.data_stored(),
        preview_id: node.preview_id(),
        content_offset_x: node.content_offset_x(),
        content_offset_y: node.content_offset_y(),
        scale_factor_by_120: node.scale_factor_by_120(),
        refiner_model: opt_string(node.refiner_model()),
        original_image_height: node.original_image_height(),
        original_image_width: node.original_image_width(),
        crop_top: node.crop_top(),
        crop_left: node.crop_left(),
        target_image_height: node.target_image_height(),
        target_image_width: node.target_image_width(),
        aesthetic_score: node.aesthetic_score(),
        negative_aesthetic_score: node.negative_aesthetic_score(),
        zero_negative_prompt: node.zero_negative_prompt(),
        refiner_start: node.refiner_start(),
        negative_original_image_height: node.negative_original_image_height(),
        negative_original_image_width: node.negative_original_image_width(),
        shuffle_data_stored: node.shuffle_data_stored(),
        fps_id: node.fps_id(),
        motion_bucket_id: node.motion_bucket_id(),
        cond_aug: node.cond_aug(),
        start_frame_cfg: node.start_frame_cfg(),
        num_frames: node.num_frames(),
        mask_blur_outset: node.mask_blur_outset(),
        sharpness: node.sharpness(),
        shift: node.shift(),
        stage_2_steps: node.stage_2_steps(),
        stage_2_cfg: node.stage_2_cfg(),
        stage_2_shift: node.stage_2_shift(),
        tiled_decoding: node.tiled_decoding(),
        decoding_tile_width: node.decoding_tile_width(),
        decoding_tile_height: node.decoding_tile_height(),
        decoding_tile_overlap: node.decoding_tile_overlap(),
        stochastic_sampling_gamma: node.stochastic_sampling_gamma(),
        preserve_original_after_inpaint: node.preserve_original_after_inpaint(),
        tiled_diffusion: node.tiled_diffusion(),
        diffusion_tile_width: node.diffusion_tile_width(),
        diffusion_tile_height: node.diffusion_tile_height(),
        diffusion_tile_overlap: node.diffusion_tile_overlap(),
        upscaler_scale_factor: node.upscaler_scale_factor(),
        script_session_id: node.script_session_id(),
        t5_text_encoder: node.t5_text_encoder(),
        separate_clip_l: node.separate_clip_l(),
        clip_l_text: opt_string(node.clip_l_text()),
        separate_open_clip_g: node.separate_open_clip_g(),
        open_clip_g_text: opt_string(node.open_clip_g_text()),
        speed_up_with_guidance_embed: node.speed_up_with_guidance_embed(),
        guidance_embed: node.guidance_embed(),
        resolution_dependent_shift: node.resolution_dependent_shift(),
        profile_data,
        tea_cache_start: node.tea_cache_start(),
        tea_cache_end: node.tea_cache_end(),
        tea_cache_threshold: node.tea_cache_threshold(),
        tea_cache: node.tea_cache(),
        separate_t5: node.separate_t5(),
        t5_text: opt_string(node.t5_text()),
        tea_cache_max_skip_steps: node.tea_cache_max_skip_steps(),
        text_prompt: opt_string(node.text_prompt()),
        negative_text_prompt: opt_string(node.negative_text_prompt()),
        clip_id: node.clip_id(),
        index_in_a_clip: node.index_in_a_clip(),
        causal_inference_enabled: node.causal_inference_enabled(),
        causal_inference: node.causal_inference(),
        causal_inference_pad: node.causal_inference_pad(),
        cfg_zero_star: node.cfg_zero_star(),
        cfg_zero_init_steps: node.cfg_zero_init_steps(),
        generation_time: node.generation_time(),
        // reason: node.reason() as i32,
    })
}