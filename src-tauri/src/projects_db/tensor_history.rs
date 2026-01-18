use chrono::{DateTime, NaiveDateTime};
// use entity::enums::Sampler; // Unused import

// use tauri::Emitter; // Unused import
use super::tensor_history_mod::{Control, LoRA};
// use crate::projects_db::{ListImagesResult, ModelExtra, ProjectExtra}; // Unused import
use crate::projects_db::tensor_history_generated::root_as_tensor_history_node;

#[derive(serde::Serialize, Debug, Clone)]
pub struct ModelAndWeight {
    pub model: String,
    pub weight: f32,
}

#[derive(serde::Serialize, Debug)]
pub struct TensorHistoryImport {
    pub lineage: i64,
    pub logical_time: i64,
    pub tensor_id: String,
    pub width: u16,
    pub height: u16,
    pub seed: u32,
    pub steps: u32,
    pub guidance_scale: f32,
    pub strength: f32,
    pub model: String,
    pub wall_clock: Option<NaiveDateTime>,
    pub sampler: i8,
    pub hires_fix: bool,
    pub upscaler: Option<String>,
    pub generated: bool,
    pub controls: Vec<ModelAndWeight>,
    pub loras: Vec<ModelAndWeight>,
    pub preview_id: i64,
    pub refiner_model: Option<String>,
    pub refiner_start: f32,
    pub shift: f32,
    pub tiled_decoding: bool,
    pub tiled_diffusion: bool,
    pub resolution_dependent_shift: bool,
    pub tea_cache: bool,
    pub prompt: String,
    pub negative_prompt: String,
    pub clip_id: i64,
    pub index_in_a_clip: i32,
    pub num_frames: Option<u32>,
    pub cfg_zero_star: bool,
    // pub image_id: i64,
    pub row_id: i64,
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_shuffle: bool,
    pub has_mask: bool,
    pub text_edits: i64,
    pub text_lineage: i64,
    // pub batch_size: u32,
    // pub hires_fix_start_width: u16,
    // pub hires_fix_start_height: u16,
    // pub hires_fix_strength: f32,
    // pub scale_factor: u16,
    // pub image_guidance_scale: f32,
    // pub seed_mode: String,
    // pub clip_skip: u32,
    // pub mask_blur: f32,
    // pub face_restoration: Option<String>,
    // pub decode_with_attention: bool,
    // pub hires_fix_decode_with_attention: bool,
    // pub clip_weight: f32,
    // pub negative_prompt_for_image_prior: bool,
    // pub image_prior_steps: u32,
    // pub data_stored: i32,
    // pub content_offset_x: i32,
    // pub content_offset_y: i32,
    // pub scale_factor_by_120: i32,
    // pub original_image_height: u32,
    // pub original_image_width: u32,
    // pub crop_top: i32,
    // pub crop_left: i32,
    // pub target_image_height: u32,
    // pub target_image_width: u32,
    // pub aesthetic_score: f32,
    // pub negative_aesthetic_score: f32,
    // pub zero_negative_prompt: bool,
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
    // pub stage_2_steps: u32,
    // pub stage_2_cfg: f32,
    // pub stage_2_shift: f32,
    // pub decoding_tile_width: u16,
    // pub decoding_tile_height: u16,
    // pub decoding_tile_overlap: u16,
    // pub stochastic_sampling_gamma: f32,
    // pub preserve_original_after_inpaint: bool,
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
    // pub profile_data: Vec<u8>,
    // pub tea_cache_start: i32,
    // pub tea_cache_end: i32,
    // pub tea_cache_threshold: f32,
    // pub separate_t5: bool,
    // pub t5_text: Option<String>,
    // pub tea_cache_max_skip_steps: i32,
    // pub causal_inference_enabled: bool,
    // pub causal_inference: i32,
    // pub causal_inference_pad: i32,
    // pub cfg_zero_init_steps: i32,
    // pub generation_time: f64,
    // pub reason: i32,
}

impl TensorHistoryImport {
    pub fn new(
        blob: &[u8],
        row_id: i64,
        tensor_id: String,
        has_depth: bool,
        has_pose: bool,
        has_color: bool,
        has_custom: bool,
        has_scribble: bool,
        has_shuffle: bool,
        has_mask: bool,
    ) -> Result<Self, String> {
        // root_as_tensor_history_node returns a table accessor borrowed from blob
        let node = root_as_tensor_history_node(blob)
            .map_err(|e| format!("flatbuffers parse error: {:?}", e))?;

        let loras: Vec<ModelAndWeight> = node
            .loras()
            .map(|v| {
                v.iter()
                    .map(|l| ModelAndWeight {
                        model: l.file().unwrap().to_string(),
                        weight: l.weight(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let controls: Vec<ModelAndWeight> = node
            .controls()
            .map(|v| {
                v.iter()
                    .map(|c| ModelAndWeight {
                        model: c.file().unwrap().to_string(),
                        weight: c.weight(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(Self {
            prompt: node.text_prompt().unwrap_or("").trim().to_string(),
            negative_prompt: node.negative_text_prompt().unwrap_or("").trim().to_string(),
            model: node.model().unwrap_or("").trim().to_string(),
            lineage: node.lineage(),
            preview_id: node.preview_id(),
            tensor_id,
            row_id,
            controls,
            loras,
            generated: node.generated(),
            index_in_a_clip: node.index_in_a_clip(),
            logical_time: node.logical_time(),
            wall_clock: wall_clock_to_datetime(node.wall_clock()),
            cfg_zero_star: node.cfg_zero_star(),
            clip_id: node.clip_id(),
            num_frames: match node.clip_id() >= 0 {
                true => Some(node.num_frames()),
                false => None
            },
            guidance_scale: node.guidance_scale(),
            hires_fix: node.hires_fix(),
            height: node.start_height(),
            refiner_model: node
                .refiner_model()
                .and_then(|v| Some(v.trim().to_string())),
            refiner_start: node.refiner_start(),
            resolution_dependent_shift: node.resolution_dependent_shift(),
            sampler: node.sampler().0,
            seed: node.seed(),
            shift: node.shift(),
            steps: node.steps(),
            strength: node.strength(),
            tiled_decoding: node.tiled_decoding(),
            tiled_diffusion: node.tiled_diffusion(),
            width: node.start_width(),
            tea_cache: node.tea_cache(),
            upscaler: node.upscaler().and_then(|v| Some(v.trim().to_string())),
            has_depth,
            has_pose,
            has_color,
            has_custom,
            has_scribble,
            has_shuffle,
            has_mask,
            text_edits: node.text_edits(),
            text_lineage: node.text_lineage(),
        })
    }
}

/**
 * TensorHistoryNode is the flatbuffer struct for the tensorhistorynode table.
 * values are exactly as they are when stored in the project files,
 * with the exception of profile data which is not implemented
 */
#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorHistoryNode {
    pub lineage: i64,
    pub logical_time: i64,
    pub start_width: u16,    //
    pub start_height: u16,   //
    pub seed: u32,           //
    pub steps: u32,          //
    pub guidance_scale: f32, //
    pub strength: f32,       //
    pub model: Option<String>,
    pub tensor_id: i64,
    pub mask_id: i64,
    pub wall_clock: Option<NaiveDateTime>,
    pub text_edits: i64,
    pub text_lineage: i64,
    pub batch_size: u32,
    pub sampler: i8,                 //
    pub hires_fix: bool,             //
    pub hires_fix_start_width: u16,  //
    pub hires_fix_start_height: u16, //
    pub hires_fix_strength: f32,     //
    pub upscaler: Option<String>,    //
    pub scale_factor: u16,
    pub depth_map_id: i64,
    pub generated: bool,
    pub image_guidance_scale: f32, //
    pub seed_mode: i8,
    pub clip_skip: u32,
    pub controls: Option<Vec<Control>>,
    pub scribble_id: i64,
    pub pose_id: i64,
    pub loras: Option<Vec<LoRA>>,
    pub color_palette_id: i64,
    pub mask_blur: f32,
    pub custom_id: i64,
    pub face_restoration: Option<String>,
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
    pub shift: f32, //
    pub stage_2_steps: u32,
    pub stage_2_cfg: f32,
    pub stage_2_shift: f32,
    pub tiled_decoding: bool, //
    pub decoding_tile_width: u16,
    pub decoding_tile_height: u16,
    pub decoding_tile_overlap: u16,
    pub stochastic_sampling_gamma: f32,
    pub preserve_original_after_inpaint: bool,
    pub tiled_diffusion: bool, //
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
    pub guidance_embed: f32,              //
    pub resolution_dependent_shift: bool, //
    // pub profile_data: Option<flatbuffers::WIPOffset<flatbuffers::Vector<'a, u8>>>,
    pub tea_cache_start: i32,
    pub tea_cache_end: i32,
    pub tea_cache_threshold: f32,
    pub tea_cache: bool, //
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
    pub reason: i32,
}

impl TryFrom<&[u8]> for TensorHistoryNode {
    type Error = flatbuffers::InvalidFlatbuffer;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        let node = root_as_tensor_history_node(bytes)?;

        let loras: Option<Vec<LoRA>> = match node.loras() {
            Some(v) => Some(LoRA::from_fb(v)?),
            None => None,
        };

        let controls: Option<Vec<Control>> = match node.controls() {
            Some(v) => Some(Control::from_fb(v)?),
            None => None,
        };

        Ok(TensorHistoryNode {
            lineage: node.lineage(),
            logical_time: node.logical_time(),
            start_width: node.start_width(),
            start_height: node.start_height(),
            seed: node.seed(),
            steps: node.steps(),
            guidance_scale: node.guidance_scale(),
            strength: node.strength(),
            model: node.model().map(|m| m.to_string()),
            tensor_id: node.tensor_id(),
            mask_id: node.mask_id(),
            wall_clock: wall_clock_to_datetime(node.wall_clock()),
            text_edits: node.text_edits(),
            text_lineage: node.text_lineage(),
            batch_size: node.batch_size(),
            sampler: node.sampler().0,
            hires_fix: node.hires_fix(),
            hires_fix_start_width: node.hires_fix_start_width(),
            hires_fix_start_height: node.hires_fix_start_height(),
            hires_fix_strength: node.hires_fix_strength(),
            upscaler: node.upscaler().map(|m| m.to_string()),
            scale_factor: node.scale_factor(),
            depth_map_id: node.depth_map_id(),
            generated: node.generated(),
            image_guidance_scale: node.image_guidance_scale(),
            seed_mode: node.seed_mode().0,
            clip_skip: node.clip_skip(),
            controls,
            scribble_id: node.scribble_id(),
            pose_id: node.pose_id(),
            loras,
            color_palette_id: node.color_palette_id(),
            mask_blur: node.mask_blur(),
            custom_id: node.custom_id(),
            face_restoration: node.face_restoration().map(|m| m.to_string()),
            clip_weight: node.clip_weight(),
            negative_prompt_for_image_prior: node.negative_prompt_for_image_prior(),
            image_prior_steps: node.image_prior_steps(),
            data_stored: node.data_stored(),
            preview_id: node.preview_id(),
            content_offset_x: node.content_offset_x(),
            content_offset_y: node.content_offset_y(),
            scale_factor_by_120: node.scale_factor_by_120(),
            refiner_model: node.refiner_model().map(|m| m.to_string()),
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
            clip_l_text: node.clip_l_text().map(|m| m.to_string()),
            separate_open_clip_g: node.separate_open_clip_g(),
            open_clip_g_text: node.open_clip_g_text().map(|m| m.to_string()),
            speed_up_with_guidance_embed: node.speed_up_with_guidance_embed(),
            guidance_embed: node.guidance_embed(),
            resolution_dependent_shift: node.resolution_dependent_shift(),
            // profile_data: node.profile_data(),
            tea_cache_start: node.tea_cache_start(),
            tea_cache_end: node.tea_cache_end(),
            tea_cache_threshold: node.tea_cache_threshold(),
            tea_cache: node.tea_cache(),
            separate_t5: node.separate_t5(),
            t5_text: node.t5_text().map(|m| m.to_string()),
            tea_cache_max_skip_steps: node.tea_cache_max_skip_steps(),
            text_prompt: node.text_prompt().map(|m| m.to_string()),
            negative_text_prompt: node.negative_text_prompt().map(|m| m.to_string()),
            clip_id: node.clip_id(),
            index_in_a_clip: node.index_in_a_clip(),
            causal_inference_enabled: node.causal_inference_enabled(),
            causal_inference: node.causal_inference(),
            causal_inference_pad: node.causal_inference_pad(),
            cfg_zero_star: node.cfg_zero_star(),
            cfg_zero_init_steps: node.cfg_zero_init_steps(),
            generation_time: node.generation_time(),
            reason: node.reason().0,
        })
    }
}

fn wall_clock_to_datetime(value: i64) -> Option<NaiveDateTime> {
    if value > 1_000_000_000_000_000 {
        // microseconds
        let secs = value / 1_000_000;
        let micros = (value % 1_000_000) as u32;
        DateTime::from_timestamp(secs, micros * 1000).map(|dt| dt.naive_local())
    } else if value > 1_000_000_000 {
        // seconds
        DateTime::from_timestamp(value, 0).map(|dt| dt.naive_local())
    } else {
        None
    }
}
