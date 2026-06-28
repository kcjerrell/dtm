pub use crate::projects_db::dtos::clip::Clip;
use crate::projects_db::{dt_project::DTProjectTable, DTProject};
use sqlx::FromRow;

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

        let rows = sqlx::query(&query_str).fetch_all(&*self.pool).await?;

        let clips = rows.iter().map(Clip::map_row).collect();

        Ok(clips)
    }
}
