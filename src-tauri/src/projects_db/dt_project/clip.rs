use serde::Serialize;
use sqlx::{query_as, FromRow};
use crate::projects_db::{
    fbs::root_as_clip,
    DTProject,
};

#[derive(Serialize, Debug, Clone)]
pub struct Clip {
    pub clip_id: i64,
    pub count: i32,
    pub frames_per_second: f64,
    pub width: i32,
    pub height: i32,
    pub audio_id: i64,
}

pub enum ClipFilter {
    None,
    ClipId(i64),
    ClipIds(Vec<i64>),
}

#[derive(FromRow)]
struct ClipRow {
    #[sqlx(rename = "__pk0")]
    clip_id: i64,
    #[sqlx(rename = "p")]
    data: Vec<u8>,
}

impl DTProject {
    pub async fn get_clips(&self, filter: ClipFilter) -> Result<Vec<Clip>, sqlx::Error> {
        let mut query_str = "SELECT __pk0, p FROM clip".to_string();
        
        match filter {
            ClipFilter::None => {},
            ClipFilter::ClipId(id) => {
                query_str.push_str(&format!(" WHERE __pk0 = {}", id));
            },
            ClipFilter::ClipIds(ids) => {
                if ids.is_empty() {
                    return Ok(vec![]);
                }
                let ids_str = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
                query_str.push_str(&format!(" WHERE __pk0 IN ({})", ids_str));
            }
        }

        let rows: Vec<ClipRow> = query_as(&query_str).fetch_all(&*self.pool).await?;
        
        let clips = rows.into_iter().map(|row| {
            let fb = root_as_clip(&row.data).unwrap();
            Clip {
                clip_id: fb.clip_id(),
                count: fb.count(),
                frames_per_second: fb.frames_per_second(),
                width: fb.width(),
                height: fb.height(),
                audio_id: fb.audio_id(),
            }
        }).collect();

        Ok(clips)
    }
}
