use serde::Serialize;
use sqlx::{sqlite::SqliteRow, Row};

use crate::projects_db::{
    dt_project::Clip,
    fbs::{root_as_clip, root_as_tensor_history_node},
};

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipFrame {
    pub tensor_id: String,
    pub preview_id: i64,
    pub index_in_a_clip: i32,
    pub row_id: i64,
}

impl ClipFrame {
    pub fn new(row_id: i64, blob: &[u8], tensor_id: String) -> Result<Self, String> {
        let node = root_as_tensor_history_node(blob)
            .map_err(|e| format!("flatbuffers parse error: {:?}", e))?;
        Ok(Self {
            tensor_id,
            preview_id: node.preview_id(),
            index_in_a_clip: node.index_in_a_clip(),
            row_id,
        })
    }
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipExtra {
    pub clip: Clip,
    pub frames: Vec<ClipFrame>,
}
