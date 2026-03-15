use serde::Serialize;
use sqlx::{sqlite::SqliteRow, Row};

use crate::projects_db::fbs::root_as_clip;

#[derive(Debug, Serialize)]
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
