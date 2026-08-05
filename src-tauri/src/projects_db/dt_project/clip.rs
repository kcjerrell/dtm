use crate::projects_db::{
    dt_project::{
        fbs::{root_as_clip, root_as_tensor_history_node},
        DTProjectTable,
    },
    DTProject,
};
use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, AssertSqlSafe, FromRow, Row};

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

#[derive(Serialize, Debug, Clone)]
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

impl<'r> FromRow<'r, SqliteRow> for ClipFrame {
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        let row_id: i64 = row.get(0);
        let blob: &[u8] = row.get(1);
        let tensor_id: String = row.get(2);

        let node =
            root_as_tensor_history_node(blob).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

        Ok(Self {
            tensor_id,
            preview_id: node.preview_id(),
            index_in_a_clip: node.index_in_a_clip(),
            row_id,
        })
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipExtra {
    pub clip: Clip,
    pub frames: Vec<ClipFrame>,
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
    /// Retrieves all clips in the project
    None,
    /// Retrieves a clip by its id
    ClipId(i64),
    /// Retrieves clips by their ids
    ClipIds(Vec<i64>),
    /// Retrieves a clip for an audio id
    AudioId(i64),
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
            ClipFilter::AudioId(audio_id) => {
                self.check_table(&DTProjectTable::ClipAudio).await?;
                query_str.push_str(&" JOIN clip__f14 on clip.rowid = clip__f14.rowid");
                query_str.push_str(&format!(" WHERE audio_id = {}", audio_id));
            }
        }

        let rows: Vec<Clip> = query_as(AssertSqlSafe(query_str))
            .fetch_all(&*self.pool)
            .await?;

        Ok(rows)
    }

    pub async fn get_clip_and_frames(
        &self,
        node_id: i64,
        clip_id: i64,
    ) -> anyhow::Result<ClipExtra> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;
        self.check_table(&DTProjectTable::Clip).await?;

        let clip: Clip = query_as("SELECT rowid, __pk0, p FROM clip where __pk0 = ?1")
            .bind(clip_id)
            .fetch_one(&*self.pool)
            .await?;

        let frames: Vec<ClipFrame> = query_as(CLIP_QUERY)
            .bind(node_id)
            .bind(node_id + clip.count as i64)
            .fetch_all(&*self.pool)
            .await?;

        let extra = ClipExtra {
            clip: clip.clone(),
            frames,
        };

        Ok(extra)
    }
}

const CLIP_QUERY: &str = "
    WITH td_ranked AS (
        SELECT
            td.*,
            ROW_NUMBER() OVER (
                PARTITION BY td.__pk0, td.__pk1
                ORDER BY td.__pk2 DESC  -- prefer pk2 = 1
            ) AS rn
        FROM tensordata AS td
    )
    SELECT
        thn.rowid,
        thn.p AS data_blob,
        'tensor_history_' || td_f20.f20 AS tensor_id
    FROM tensorhistorynode AS thn
    LEFT JOIN td_ranked AS td
        ON thn.__pk0 = td.__pk0
    AND thn.__pk1 = td.__pk1
    AND td.rn = 1  -- pick the preferred row per pk0/pk1
    LEFT JOIN tensordata__f20 AS td_f20
        ON td.rowid = td_f20.rowid
    WHERE thn.rowid >= ?1
    AND thn.rowid < ?2
    ORDER BY thn.rowid;\n        ";
