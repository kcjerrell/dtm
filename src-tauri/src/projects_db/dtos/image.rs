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
    pub model_id: Option<i32>,
    pub model_file: Option<String>,
    pub prompt: String,
    pub negative_prompt: String,
    pub num_frames: Option<i16>,
    pub preview_id: i64,
    pub node_id: i64,
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_shuffle: bool,
    pub start_width: i32,
    pub start_height: i32,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: u64,
}