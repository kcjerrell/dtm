use serde::Serialize;
use sqlx::{sqlite::SqliteRow, Row};

use crate::projects_db::fbs::{root_as_clip, root_as_tensor_history_node};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub row_id: i64,
    pub clip_id: i64,
    pub count: i32,
    pub frames_per_second: f64,
    pub width: i32,
    pub height: i32,
    pub audio_id: i64,
}

impl Clip {
    pub fn map_row(row: &SqliteRow) -> Self {
        let p = row.get::<Vec<u8>, _>("p");
        let data = root_as_clip(&p).unwrap();
        Self {
            row_id: row.get("rowid"),
            clip_id: row.get("__pk0"),
            count: data.count(),
            frames_per_second: data.frames_per_second(),
            width: data.width(),
            height: data.height(),
            audio_id: data.audio_id(),
        }
    }
}

impl sqlx::FromRow<'_, SqliteRow> for Clip {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self::map_row(row))
    }
}

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
