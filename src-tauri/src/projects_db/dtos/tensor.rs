use crate::projects_db::tensor_history_generated::{
    root_as_tensor_history_node as root_as_tensor_history_node_fb, LoRA as LoRAFb, LoRAMode,
};
use crate::projects_db::{
    fbs::{root_as_tensor_data, root_as_tensor_history_node, TensorData},
    tensor_history_mod::{Control, LoRA},
    tensor_history_tensor_data::TensorHistoryTensorData,
};
use chrono::{DateTime, NaiveDateTime};

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
    pub upscaler_scale_factor: u8,
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
}

impl From<&TensorHistoryTensorData> for TensorHistoryImport {
    fn from(row: &TensorHistoryTensorData) -> Self {
        let row_id = row.node_id;

        let node_data = &row.node_data;
        let tensor_data = root_as_tensor_data(&row.tensor_data).unwrap();

        let mut history = TensorHistoryImport::new(
            node_data,
            row_id,
            "".to_string(),
            false,
            false,
            false,
            false,
            false,
            false,
            false,
        )
        .unwrap();

        update_history_import_flags(&mut history, &tensor_data);

        history
    }
}

fn update_history_import_flags(history: &mut TensorHistoryImport, tensor_data: &TensorData) {
    if tensor_data.tensor_id() > 0 {
        history.tensor_id = format!("tensor_history_{}", tensor_data.tensor_id());
    }
    if tensor_data.mask_id() > 0 {
        history.has_mask = true;
    }
    if tensor_data.depth_map_id() > 0 {
        history.has_depth = true;
    }
    if tensor_data.scribble_id() > 0 {
        history.has_scribble = true;
    }
    if tensor_data.pose_id() > 0 {
        history.has_pose = true;
    }
    if tensor_data.color_palette_id() > 0 {
        history.has_color = true;
    }
    if tensor_data.custom_id() > 0 {
        history.has_custom = true;
    }
}

pub struct TensorNodeGrouper<'a> {
    index: usize,
    // data: &[TensorHistoryTensorData],
    current_row: Option<&'a TensorHistoryTensorData>,
    current_item: Option<TensorHistoryImport>,
    rows_iter: std::slice::Iter<'a, TensorHistoryTensorData>,
}

impl Iterator for TensorNodeGrouper<'_> {
    type Item = TensorHistoryImport;
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            // if we don't have a row, pop one off
            let row = self.current_row.or_else(|| self.rows_iter.next());

            // when no rows are left, return the item (or none)
            if row.is_none() {
                return self.current_item.take();
            }
            let row = row.unwrap();

            // if we don't have an item, make one
            let item = self.current_item.take();
            let mut item = item.unwrap_or_else(|| TensorHistoryImport::from(row));

            // if the row doesn't match, clear the item return it
            if row.node_id != item.row_id {
                self.current_row = Some(row);
                return Some(item);
            }

            // otherwise, the row matches the item, update the item and clear the row
            update_history_import_flags(&mut item, &root_as_tensor_data(&row.tensor_data).unwrap());
            self.current_row = None;

            // hold onto before looping
            self.current_item = Some(item);
        }
    }
}

impl<'a> TensorNodeGrouper<'a> {
    pub fn new(data: &'a [TensorHistoryTensorData]) -> Self {
        Self {
            index: 0,
            rows_iter: data.iter(),
            current_row: None,
            current_item: None,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorHistoryNode {
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
    pub wall_clock: Option<NaiveDateTime>,
    pub text_edits: i64,
    pub text_lineage: i64,
    pub batch_size: u32,
    pub sampler: i8,
    pub hires_fix: bool,
    pub hires_fix_start_width: u16,
    pub hires_fix_start_height: u16,
    pub hires_fix_strength: f32,
    pub upscaler: Option<String>,
    pub scale_factor: u16,
    pub depth_map_id: i64,
    pub generated: bool,
    pub image_guidance_scale: f32,
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
    pub reason: i32,
    pub compression_artifacts: i8,
    pub compression_artifacts_quality: f32,
    pub audio: bool,
}

/**
 * TensorHistoryNode is the flatbuffer struct for the tensorhistorynode table.
 * values are exactly as they are when stored in the project files,
 * with the exception of profile data which is not implemented
 */

impl TryFrom<&[u8]> for TensorHistoryNode {
    type Error = flatbuffers::InvalidFlatbuffer;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        let node = root_as_tensor_history_node_fb(bytes)?;

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
            compression_artifacts: node.compression_artifacts().0,
            compression_artifacts_quality: node.compression_artifacts_quality(),
            audio: node.audio(),
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorHistoryExtra {
    pub row_id: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub tensor_id: Option<String>,
    pub mask_id: Option<String>,
    pub depth_map_id: Option<String>,
    pub scribble_id: Option<String>,
    pub pose_id: Option<String>,
    pub color_palette_id: Option<String>,
    pub custom_id: Option<String>,
    pub moodboard_ids: Vec<String>,
    pub history: TensorHistoryNode,
    pub project_path: String,
}

impl From<(Vec<TensorHistoryTensorData>, String)> for TensorHistoryExtra {
    fn from((rows, project_path): (Vec<TensorHistoryTensorData>, String)) -> Self {
        assert!(!rows.is_empty(), "must have at least one row");

        let node_id = rows[0].node_id;
        let lineage = rows[0].lineage;
        let logical_time = rows[0].logical_time;

        // Take the node data from the first row (they're all the same)
        let node_data = &rows[0].node_data;
        let history = TensorHistoryNode::try_from(node_data.as_ref()).unwrap();

        // Initialize optional fields
        let mut tensor_id: Option<String> = None;
        let mut mask_id: Option<String> = None;
        let mut depth_map_id: Option<String> = None;
        let mut scribble_id: Option<String> = None;
        let mut pose_id: Option<String> = None;
        let mut color_palette_id: Option<String> = None;
        let mut custom_id: Option<String> = None;
        let moodboard_ids: Vec<String> = Vec::new();

        // Iterate all tensor rows
        for row in rows {
            let tensor_fb = root_as_tensor_data(&row.tensor_data).unwrap();

            if tensor_fb.tensor_id() > 0 {
                tensor_id = Some(format!("tensor_history_{}", tensor_fb.tensor_id()));
            }
            if tensor_fb.mask_id() > 0 {
                mask_id = Some(format!("binary_mask_{}", tensor_fb.mask_id()));
            }
            if tensor_fb.depth_map_id() > 0 {
                depth_map_id = Some(format!("depth_map_{}", tensor_fb.depth_map_id()));
            }
            if tensor_fb.scribble_id() > 0 {
                scribble_id = Some(format!("scribble_{}", tensor_fb.scribble_id()));
            }
            if tensor_fb.pose_id() > 0 {
                pose_id = Some(format!("pose_{}", tensor_fb.pose_id()));
            }
            if tensor_fb.color_palette_id() > 0 {
                color_palette_id = Some(format!("color_palette_{}", tensor_fb.color_palette_id()));
            }
            if tensor_fb.custom_id() > 0 {
                custom_id = Some(format!("custom_{}", tensor_fb.custom_id()));
            }

            // if let Some(mb_ids) = tensor_fb.() {
            //     moodboard_ids.extend(mb_ids.iter().map(|s| s.to_string()));
            // }
        }

        Self {
            row_id: node_id,
            lineage,
            logical_time,
            tensor_id,
            mask_id,
            depth_map_id,
            scribble_id,
            pose_id,
            color_palette_id,
            custom_id,
            moodboard_ids,
            history,
            project_path,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorRaw {
    pub name: String,
    pub tensor_type: i64,
    pub data_type: i32,
    pub format: i32,
    pub n: i32,
    pub width: i32,
    pub height: i32,
    pub channels: i32,
    pub dim: Vec<u8>,
    pub data: Vec<u8>,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorSize {
    pub width: i32,
    pub height: i32,
    pub channels: i32,
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
