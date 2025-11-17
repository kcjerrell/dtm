use std::sync::Arc;

use crate::projects_db::{tensor_history::TensorHistoryNode, TensorHistoryImport};
use byteorder::{LittleEndian, WriteBytesExt};
use moka::future::Cache;
use once_cell::sync::Lazy;
use serde::Serialize;
use sqlx::{query, sqlite::SqliteRow, Error, Row, SqlitePool};

static PROJECT_CACHE: Lazy<Cache<String, Arc<DTProject>>> = Lazy::new(|| {
    Cache::builder()
        .max_capacity(16)
        .time_to_idle(std::time::Duration::from_secs(300)) // 10 min idle timeout
        .build()
});

pub struct DTProject {
    pool: SqlitePool,
    path: String,
    has_history: bool,
    has_moodboard: bool,
}

impl DTProject {
    pub async fn new(db_path: &str) -> Result<Self, Error> {
        let connect_string = format!("sqlite:{}?mode=ro", db_path);
        let pool = SqlitePool::connect(&connect_string).await?;

        let tables: Vec<(String,)> =
            sqlx::query_as::<_, (String,)>("SELECT name FROM sqlite_master WHERE type='table';")
                .fetch_all(&pool)
                .await?;
        // .map_err(|e| e.to_string())?;

        // let has_history = tables.iter().any(|t| t.0 == "tensorhistorynode");
        // let has_moodboard = tables.iter().any(|t| t.0 == "tensormoodboarddata");

        let mut dtp = Self {
            pool,
            path: db_path.to_string(),
            has_history: false,
            has_moodboard: false,
        };

        dtp.refresh_tables().await?;

        Ok(dtp)
    }

    pub async fn refresh_tables(&mut self) -> Result<(), Error> {
        let tables: Vec<(String,)> =
            sqlx::query_as::<_, (String,)>("SELECT name FROM sqlite_master WHERE type='table';")
                .fetch_all(&self.pool)
                .await?;
        // .map_err(|e| e.to_string())?;

        let has_history = tables.iter().any(|t| t.0 == "tensorhistorynode");
        let has_moodboard = tables.iter().any(|t| t.0 == "tensormoodboarddata");

        self.has_history = has_history;
        self.has_moodboard = has_moodboard;

        Ok(())
    }

    pub async fn get(path: &str) -> Result<Arc<DTProject>, String> {
        // Use `try_get_with` to reuse or lazily insert.
        let arc = PROJECT_CACHE
            .try_get_with(path.to_string(), async move {
                let proj = DTProject::new(path).await?;
                Ok::<_, Error>(Arc::new(proj))
            })
            .await
            .map_err(|e| e.to_string())?;

        Ok(arc)
    }

    pub async fn get_tensor_history(
        &self,
        first_id: i64,
        count: i64,
    ) -> Result<Vec<TensorHistoryImport>, Error> {
        let last_id = first_id + count;

        let items: Vec<TensorHistoryImport> = query(
          "SELECT p, f86, tensorhistorynode.rowid FROM tensorhistorynode LEFT JOIN tensorhistorynode__f86 ON tensorhistorynode.rowid == tensorhistorynode__f86.rowid
           WHERE tensorhistorynode.rowid BETWEEN ?1 AND ?2
           ORDER BY tensorhistorynode.rowid ASC"
        )
        .bind(first_id)
        .bind(last_id)
        .map(|row: SqliteRow| {
            let p: Vec<u8> = row.get(0);
            let image_id: i64 = row.get(1);
            let row_id: i64 = row.get(2);
            TensorHistoryImport::new(&p, row_id, image_id).unwrap()
            // parse_tensor_history(&p, row_id, image_id).unwrap()
        })
        .fetch_all(&self.pool).await?;

        Ok(items)
    }

    pub async fn get_history_count(&self) -> Result<i64, Error> {
        let count: i64 = query("SELECT COUNT(*) FROM tensorhistorynode")
            .fetch_one(&self.pool)
            .await?
            .get(0);
        Ok(count)
    }

    pub async fn get_tensor(&self, name: &str) -> Result<Vec<u8>, Error> {
        let row = query("SELECT type, format, datatype, dim, data FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&self.pool)
            .await?;

        let t: i64 = row.get(0);
        let format: i32 = row.get(1);
        let datatype: i32 = row.get(2);
        let dim: Vec<u8> = row.get(3);
        let data: Vec<u8> = row.get(4);

        let high = (t >> 32) as u32;
        let low = t as u32;
        let swapped_t: i64 = ((low as i64) << 32) | (high as i64);

        let mut buf = Vec::with_capacity(68 + data.len());

        buf.write_i64::<LittleEndian>(swapped_t)?;
        buf.write_i32::<LittleEndian>(format)?;
        buf.write_i32::<LittleEndian>(datatype)?;
        buf.write_i32::<LittleEndian>(0)?;

        // pad header to 68 bytes
        let mut header = vec![0u8; 48];
        header[..dim.len()].copy_from_slice(&dim);
        buf.extend_from_slice(&header);

        // now data starts exactly at offset 68
        buf.extend_from_slice(&data);

        Ok(buf)
    }

    pub async fn get_tensor_raw(&self, name: &str) -> Result<TensorRaw, Error> {
        let row = query("SELECT type, format, datatype, dim, data FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&self.pool)
            .await?;

        let tensor_type: i64 = row.get(0);
        let format: i32 = row.get(1);
        let data_type: i32 = row.get(2);
        let dim: Vec<u8> = row.get(3);
        let data: Vec<u8> = row.get(4);

        let height = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
        let width = i32::from_le_bytes(dim[8..12].try_into().ok().unwrap());
        let channels = i32::from_le_bytes(dim[12..16].try_into().ok().unwrap());

        Ok(TensorRaw {
            tensor_type,
            format,
            data_type,
            height,
            width,
            channels,
            dim,
            data,
        })
    }

    pub async fn get_info(&self) -> Result<DTProjectInfo, Error> {
        let result = query(
            "SELECT COUNT(*) AS total_count, MAX(rowid) AS last_rowid FROM tensorhistorynode;",
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(DTProjectInfo {
            path: self.path.clone(),
            history_count: result.get(0),
            history_max_id: result.get(1),
        })
    }

    pub async fn get_thumb_half(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    pub async fn get_thumb(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        let result = query("SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    pub async fn get_history_full(&self, row_id: i64) -> Result<TensorHistoryExtra, String> {
        let mut item: TensorHistoryExtra = query(&full_query_where("thn.rowid == ?1"))
            .bind(row_id)
            .map(|row: SqliteRow| self.map_full(row))
            .fetch_one(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        item.moodboard_ids = self
            .get_shuffle_ids(item.lineage, item.logical_time)
            .await?;
        // item.moodboard_ids = Some(moodboard_ids);

        Ok(item)
    }

    fn map_full(&self, row: SqliteRow) -> TensorHistoryExtra {
        let row_id = row.get(0);
        let lineage = row.get(1);
        let logical_time = row.get(2);
        let p: &[u8] = row.get(3);
        let tensor_id = row.get(4);
        let mask_id = row.get(5);
        let depth_map_id = row.get(6);
        let scribble_id = row.get(7);
        let pose_id = row.get(8);
        let color_palette_id = row.get(9);
        let custom_id = row.get(10);
        let history = TensorHistoryNode::try_from(p);

        TensorHistoryExtra {
            row_id,
            lineage,
            logical_time,
            tensor_id,
            mask_id,
            depth_map_id,
            scribble_id,
            pose_id,
            color_palette_id,
            custom_id,
            moodboard_ids: Vec::new(),
            project_path: self.path.clone(),
            history: history.unwrap(),
        }
    }

    pub async fn get_shuffle_ids(
        &self,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<String>, String> {
        if !self.has_moodboard {
            return Ok(Vec::new());
        }

        let shuffle_ids = query(
            "
            SELECT
            'shuffle_' || f10.f10 as shuffle_id
			FROM tensormoodboarddata AS tmd
			
			LEFT JOIN tensormoodboarddata__f10 AS f10 ON tmd.rowid == f10.rowid

            WHERE tmd.__pk0 == ?1 AND tmd.__pk1 == ?2
        ",
        )
        .bind(lineage)
        .bind(logical_time)
        .map(|row: SqliteRow| row.get(0))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(shuffle_ids)
    }

    pub async fn find_predecessor_candidates(
        &self,
        row_id: i64,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<TensorHistoryExtra>, String> {
        let q = &full_query_where("thn.__pk1 == ?1 AND thn.rowid < ?2");
        let candidates = query(q)
            .bind(logical_time - 1)
            .bind(row_id)
            .map(|row: SqliteRow| self.map_full(row))
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        let mut same_lineage: Option<&TensorHistoryExtra> = None;
        let mut one_less: Option<&TensorHistoryExtra> = None;
        let mut next_closest: Option<&TensorHistoryExtra> = None;
        let mut highest_closest: Option<&TensorHistoryExtra> = None;

        for candidate in &candidates {
            use std::cmp::Ordering::*;

            match candidate.lineage.cmp(&lineage) {
                Equal => {
                    same_lineage = Some(candidate);
                }
                Less => {
                    if candidate.lineage == lineage - 1 {
                        one_less = Some(candidate);
                    }
                }
                Greater => {
                    next_closest = match next_closest {
                        Some(existing) if candidate.lineage < existing.lineage => Some(candidate),
                        None => Some(candidate),
                        other => other,
                    };

                    highest_closest = match highest_closest {
                        Some(existing) if candidate.lineage > existing.lineage => Some(candidate),
                        None => Some(candidate),
                        other => other,
                    };
                }
            }
        }

        let result: Vec<TensorHistoryExtra> =
            [same_lineage, one_less, next_closest, highest_closest]
                .into_iter()
                .flatten() // remove None, leave &TensorHistoryExtra
                .cloned() // clone only the ones we actually return
                .collect();

        Ok(result)
    }
}

pub struct DTProjectInfo {
    pub path: String,
    pub history_count: i64,
    pub history_max_id: i64,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Serialize, Clone)]
pub struct TensorRaw {
    pub tensor_type: i64,
    pub data_type: i32,
    pub format: i32,
    pub width: i32,
    pub height: i32,
    pub channels: i32,
    pub dim: Vec<u8>,
    pub data: Vec<u8>,
}

fn full_query_where(where_expr: &str) -> String {
    format!(
        "
            SELECT
                thn.rowid,
                thn.__pk0 AS lineage,
                thn.__pk1 AS logical_time,
                thn.p      AS data_blob,

                -- Indexed fields from tensordata with prefix & 0 → NULL
                MAX('tensor_history_'   || NULLIF(td.f20, 0)) AS tensor_id,
                MAX('binary_mask_'      || NULLIF(td.f22, 0)) AS mask_id,
                MAX('depth_map_'        || NULLIF(td.f24, 0)) AS depth_map_id,
                MAX('scribble_'         || NULLIF(td.f26, 0)) AS scribble_id,
                MAX('pose_'             || NULLIF(td.f28, 0)) AS pose_id,
                MAX('color_palette_'    || NULLIF(td.f30, 0)) AS color_palette_id,
                MAX('custom_'           || NULLIF(td.f32, 0)) AS custom_id

            FROM tensorhistorynode AS thn

            -- Join tensordata on the two primary keys
            LEFT JOIN (
                SELECT
                    td.rowid,
                    td.__pk0,
                    td.__pk1,
                    f20.f20 AS f20,
                    f22.f22 AS f22,
                    f24.f24 AS f24,
                    f26.f26 AS f26,
                    f28.f28 AS f28,
                    f30.f30 AS f30,
                    f32.f32 AS f32
                FROM tensordata AS td
                LEFT JOIN tensordata__f20 AS f20 ON f20.rowid = td.rowid
                LEFT JOIN tensordata__f22 AS f22 ON f22.rowid = td.rowid
                LEFT JOIN tensordata__f24 AS f24 ON f24.rowid = td.rowid
                LEFT JOIN tensordata__f26 AS f26 ON f26.rowid = td.rowid
                LEFT JOIN tensordata__f28 AS f28 ON f28.rowid = td.rowid
                LEFT JOIN tensordata__f30 AS f30 ON f30.rowid = td.rowid
                LEFT JOIN tensordata__f32 AS f32 ON f32.rowid = td.rowid
            ) AS td
            ON thn.__pk0 = td.__pk0 AND thn.__pk1 = td.__pk1

            WHERE {}
            GROUP BY thn.rowid, thn.__pk0, thn.__pk1
            ORDER BY thn.rowid
		    ",
        where_expr
    )
}

pub enum ProjectRef {
    Path(String),
    Id(i64),
}
