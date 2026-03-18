use crate::projects_db::filters::ListImagesFilter;
use sea_orm::FromQueryResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ListImagesOptions {
    pub project_ids: Option<Vec<i64>>,
    pub search: Option<String>,
    pub filters: Option<Vec<ListImagesFilter>>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub take: Option<i32>,
    pub skip: Option<i32>,
    pub count: Option<bool>,
    pub show_video: Option<bool>,
    pub show_image: Option<bool>,
    pub show_disconnected: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ListImagesResult {
    pub counts: Option<Vec<ImageCount>>,
    pub images: Option<Vec<ImageExtra>>,
    pub total: u64,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ImageCount {
    pub project_id: i64,
    pub count: i64,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ImageExtra {
    pub id: i64,
    pub project_id: i64,
    pub model_id: Option<i64>,
    pub model_file: Option<String>,
    pub prompt: String,
    pub negative_prompt: String,
    pub num_frames: Option<i16>,
    pub preview_id: i64,
    pub node_id: i64,
    pub has_mask: bool,
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_shuffle: bool,
    pub start_width: i16,
    pub start_height: i16,
    pub upscaler_id: Option<i64>,
    pub upscaler_scale_factor: Option<u8>,
    pub refiner_id: Option<i64>,
    pub refiner_start: Option<f32>,
    pub template_id: Option<i64>,
    pub is_ready: Option<bool>,
    pub clip_id: i64,
    pub wall_clock: sea_orm::prelude::DateTimeUtc,
    pub seed: i64,
    pub sampler: i8,
    pub steps: i16,
    pub guidance_scale: f32,
    pub strength: f32,
    pub shift: f32,
    pub hires_fix: bool,
    pub tiled_decoding: bool,
    pub tiled_diffusion: bool,
    pub tea_cache: bool,
    pub cfg_zero_star: bool,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: u64,
}
