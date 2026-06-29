use crate::projects_db::{
    dt_project::{DTProjectTable, ThnFilter},
    fbs::root_as_clip,
    DTProject,
};
use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, FromRow, Row};

/// The definitive representation of the clip table entity
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub row_id: i64,
    pub clip_id: i64,
    pub count: i32,
    pub frames_per_second: f64,
    pub width: i32,
    pub height: i32,
    pub audio_id: i64,
    pub frames: Option<Vec<ClipFrame>>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipFrame {
    pub tensor_id: String,
    pub preview_id: i64,
    pub index_in_a_clip: i32,
    pub row_id: i64,
}

impl<'r> FromRow<'r, SqliteRow> for Clip {
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        let p = row.get::<Vec<u8>, _>("p");
        let data = root_as_clip(&p).unwrap();
        Ok(Self {
            row_id: row.get("rowid"),
            clip_id: row.get("__pk0"),
            count: data.count(),
            frames_per_second: data.frames_per_second(),
            width: data.width(),
            height: data.height(),
            audio_id: data.audio_id(),
            frames: None,
        })
    }
}

pub enum ClipFilter {
    None,
    /// Retrieves a clip by its id
    ClipId(i64),
    ClipIds(Vec<i64>),
}

impl DTProject {
    pub async fn get_clips(&self, filter: ClipFilter) -> Result<Vec<Clip>, sqlx::Error> {
        self.check_table(&DTProjectTable::Clip).await?;
        let mut query_str = "SELECT rowid, __pk0, p FROM clip".to_string();

        match filter {
            ClipFilter::None => {}
            ClipFilter::ClipId(id) => {
                query_str.push_str(&format!(" WHERE __pk0 = {}", id));
            }
            ClipFilter::ClipIds(ids) => {
                if ids.is_empty() {
                    return Ok(vec![]);
                }
                let ids_str = ids
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                query_str.push_str(&format!(" WHERE __pk0 IN ({})", ids_str));
            }
        }

        let rows: Vec<Clip> = sqlx::query_as(&query_str).fetch_all(&*self.pool).await?;

        Ok(rows)
    }
}
