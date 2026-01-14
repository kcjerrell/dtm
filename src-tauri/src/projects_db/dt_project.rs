use crate::projects_db::{
    tensor_history::TensorHistoryNode, TensorHistoryImport, TextHistory, TextHistoryNode,
};
use moka::future::Cache;
use once_cell::sync::Lazy;
use serde::Serialize;
use sqlx::{query, sqlite::SqliteRow, Error, Row, SqlitePool};
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tokio::sync::OnceCell;

static PROJECT_CACHE: Lazy<Cache<String, Arc<DTProject>>> = Lazy::new(|| {
    Cache::builder()
        .max_capacity(16)
        // caching database connections for 3 seconds, so images can be loaded in bulk
        // from separate requests. Closing them early to avoid locks, in case project
        // is renamed in DT
        .time_to_idle(std::time::Duration::from_secs(3))
        .build()
});

pub struct DTProject {
    pool: SqlitePool,
    path: String,
    has_tensor_history: AtomicBool,
    has_text_history: AtomicBool,
    has_moodboard: AtomicBool,
    has_tensors: AtomicBool,

    has_thumbs: AtomicBool,
    pub text_history: OnceCell<TextHistory>,
}

#[derive(Debug, Serialize)]
enum DTProjectTable {
    TensorHistory,
    TextHistory,
    Moodboard,
    Tensors,
    Thumbs,
}

impl DTProject {
    pub async fn new(db_path: &str) -> Result<Self, Error> {
        let connect_string = format!("sqlite:{}?mode=ro", db_path);
        let pool = SqlitePool::connect(&connect_string).await?;

        let dtp = Self {
            pool,
            path: db_path.to_string(),
            has_tensor_history: AtomicBool::new(false),
            has_text_history: AtomicBool::new(false),
            has_moodboard: AtomicBool::new(false),
            has_tensors: AtomicBool::new(false),

            has_thumbs: AtomicBool::new(false),
            text_history: OnceCell::new(),
        };

        dtp.check_tables().await?;

        Ok(dtp)
    }

    pub async fn get(path: &str) -> Result<Arc<DTProject>, Error> {
        let arc = PROJECT_CACHE
            .try_get_with(path.to_string(), async move {
                let proj = DTProject::new(path).await?;
                Ok::<_, Error>(Arc::new(proj))
            })
            .await
            .map_err(|e| Error::Protocol(e.to_string()))?;

        Ok(arc)
    }

    pub async fn check_tables(&self) -> Result<(), Error> {
        let tables: Vec<(String,)> =
            sqlx::query_as::<_, (String,)>("SELECT name FROM sqlite_master WHERE type='table';")
                .fetch_all(&self.pool)
                .await?;

        for table in tables {
            match table.0.as_str() {
                "tensorhistorynode" => self.has_tensor_history.store(true, Ordering::Relaxed),
                "tensormoodboarddata" => self.has_moodboard.store(true, Ordering::Relaxed),
                "tensors" => self.has_tensors.store(true, Ordering::Relaxed),
                "thumbnailhistorynode" => self.has_thumbs.store(true, Ordering::Relaxed),
                "texthistorynode" => self.has_text_history.store(true, Ordering::Relaxed),
                _ => {}
            }
        }

        Ok(())
    }

    fn has_table(&self, table: &DTProjectTable) -> bool {
        match table {
            DTProjectTable::TensorHistory => self.has_tensor_history.load(Ordering::Relaxed),
            DTProjectTable::TextHistory => self.has_text_history.load(Ordering::Relaxed),
            DTProjectTable::Moodboard => self.has_moodboard.load(Ordering::Relaxed),
            DTProjectTable::Tensors => self.has_tensors.load(Ordering::Relaxed),
            DTProjectTable::Thumbs => self.has_thumbs.load(Ordering::Relaxed),
        }
    }

    async fn check_table(&self, table: &DTProjectTable) -> Result<bool, Error> {
        if self.has_table(table) {
            return Ok(true);
        }

        self.check_tables().await?;
        match self.has_table(table) {
            true => Ok(true),
            false => Err(Error::from(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Table not found",
            ))),
        }
    }

    pub async fn get_histories(
        &self,
        first_id: i64,
        count: i64,
    ) -> Result<Vec<TensorHistoryImport>, Error> {
        match self.check_table(&DTProjectTable::TensorHistory).await {
            Ok(_) => {}
            Err(_) => return Ok(Vec::new()),
        }

        // We need to construct a query similar to full_query_where but for a range,
        // and we need to make sure we select the f86 column (image_id) if it's available in tensorhistorynode.
        // The original query was: "SELECT p, f86, tensorhistorynode.rowid FROM tensorhistorynode ..."
        // full_query_where selects: rowid, lineage, logical_time, p, and then the content IDs.
        // It does NOT select f86.
        // We need to add f86 to the selection.

        let query_str = import_query(self.has_moodboard.load(Ordering::Relaxed));

        let items: Vec<TensorHistoryImport> = query(&query_str)
            .bind(first_id)
            .bind(first_id + count)
            .map(|row: SqliteRow| self.map_import(row))
            .fetch_all(&self.pool)
            .await?;

        let mut items = items;
        for item in items.iter_mut() {
            if item.prompt.is_empty() && item.negative_prompt.is_empty() {
                let history = self
                    .text_history
                    .get_or_try_init(|| async {
                        let nodes = self.get_text_history().await?;
                        Ok::<TextHistory, Error>(TextHistory::new(nodes))
                    })
                    .await?;

                if let Some(prompts) = history.get_edit(item.text_lineage, item.text_edits) {
                    item.prompt = prompts.positive;
                    item.negative_prompt = prompts.negative;
                }
            }
        }

        Ok(items)
    }

    fn map_import(&self, row: SqliteRow) -> TensorHistoryImport {
        let row_id: i64 = row.get(0);
        let p: &[u8] = row.get(1);
        let tensor_id: String = row.get(2);

        // These are booleans from the query (MAX(val) > 0)
        let has_mask: bool = row.get(3);
        let has_depth: bool = row.get(4);
        let has_scribble: bool = row.get(5);
        let has_pose: bool = row.get(6);
        let has_color: bool = row.get(7);
        let has_custom: bool = row.get(8);
        let has_shuffle: bool = row.get(8);

        TensorHistoryImport::new(
            p,
            row_id,
            tensor_id,
            has_depth,
            has_pose,
            has_color,
            has_custom,
            has_scribble,
            has_shuffle,
            has_mask,
        )
        .unwrap()
    }

    pub async fn get_tensor_raw(&self, name: &str) -> Result<TensorRaw, Error> {
        self.check_table(&DTProjectTable::Tensors).await?;
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
            name: name.to_string(),
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

    pub async fn get_tensor_size(&self, name: &str) -> Result<TensorSize, Error> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row = query("SELECT datatype, dim FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&self.pool)
            .await?;

        let datatype: i64 = row.get(0);
        let dim: Vec<u8> = row.get(1);

        match datatype {
            4096 => {
                let height = i32::from_le_bytes(dim[0..4].try_into().ok().unwrap());
                let width = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
                let channels = 1;
                Ok(TensorSize {
                    height,
                    width,
                    channels,
                })
            }
            131072 => {
                let height = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
                let width = i32::from_le_bytes(dim[8..12].try_into().ok().unwrap());
                let channels = i32::from_le_bytes(dim[12..16].try_into().ok().unwrap());

                Ok(TensorSize {
                    height,
                    width,
                    channels,
                })
            }
            _ => Ok(TensorSize {
                height: 1,
                width: 1,
                channels: 1,
            }),
        }
    }

    pub async fn get_info(&self) -> Result<DTProjectInfo, Error> {
        match self.check_table(&DTProjectTable::TensorHistory).await {
            Ok(_) => {}
            Err(_) => {
                return Ok(DTProjectInfo {
                    _path: self.path.clone(),
                    _history_count: 0,
                    history_max_id: 0,
                })
            }
        }
        let result = query(
            "SELECT COUNT(*) AS total_count, MAX(rowid) AS last_rowid FROM tensorhistorynode;",
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(DTProjectInfo {
            _path: self.path.clone(),
            _history_count: result.get(0),
            history_max_id: result.get(1),
        })
    }

    /*
    pub async fn batch_thumbs(&self, thumb_ids: &[i64]) -> Result<HashMap<i64, Vec<u8>>, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;

        if thumb_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build (?, ?, ?, ...)
        let placeholders = std::iter::repeat("?")
            .take(thumb_ids.len())
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT __pk0, p FROM thumbnailhistoryhalfnode WHERE __pk0 IN ({})",
            placeholders
        );

        let mut q = query(&sql);
        for id in thumb_ids {
            q = q.bind(id);
        }

        let rows = q.fetch_all(&self.pool).await?;

        let mut out = HashMap::with_capacity(rows.len());
        for row in rows {
            let id: i64 = row.get(0);
            let data: Vec<u8> = row.get(1);
            out.insert(id, extract_jpeg_slice(&data).unwrap());
        }

        Ok(out)
    }
    */

    pub async fn get_thumb_half(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    pub async fn get_thumb(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;
        let result = query("SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    pub async fn get_histories_from_clip(
        &self,
        node_id: i64,
    ) -> Result<Vec<TensorHistoryImport>, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;

        // get_history_full
        let history = self.get_history_full(node_id).await?;
        // find out num_frames and clip_id from the history,
        // let clip_id = history.history.clip_id;
        let num_frames = history.history.num_frames;
        println!("num_frames: {}, {}", num_frames, self.path);
        // and return get_histories(node_id, num_frames)
        self.get_histories(node_id, num_frames as i64).await
    }

    pub async fn get_history_full(&self, row_id: i64) -> Result<TensorHistoryExtra, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;
        let mut item: TensorHistoryExtra = query(&full_query_where("thn.rowid == ?1"))
            .bind(row_id)
            .map(|row: SqliteRow| self.map_full(row))
            .fetch_one(&self.pool)
            .await?;

        item.moodboard_ids = self
            .get_shuffle_ids(item.lineage, item.logical_time)
            .await?;
        // item.moodboard_ids = Some(moodboard_ids);

        let prompt_empty = item
            .history
            .text_prompt
            .as_ref()
            .map_or(true, |s| s.is_empty());
        let neg_prompt_empty = item
            .history
            .negative_text_prompt
            .as_ref()
            .map_or(true, |s| s.is_empty());

        if prompt_empty && neg_prompt_empty {
            let history = self
                .text_history
                .get_or_try_init(|| async {
                    let nodes = self.get_text_history().await?;
                    Ok::<TextHistory, Error>(TextHistory::new(nodes))
                })
                .await?;

            if let Some(prompts) =
                history.get_edit(item.history.text_lineage, item.history.text_edits)
            {
                item.history.text_prompt = Some(prompts.positive);
                item.history.negative_text_prompt = Some(prompts.negative);
            }
        }

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
    ) -> Result<Vec<String>, Error> {
        if self.check_table(&DTProjectTable::Moodboard).await.is_err() {
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
        .await?;

        Ok(shuffle_ids)
    }

    pub async fn find_predecessor_candidates(
        &self,
        row_id: i64,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<TensorHistoryExtra>, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;
        let q = &full_query_where("thn.__pk1 == ?1 AND thn.rowid < ?2");
        let candidates = query(q)
            .bind(logical_time - 1)
            .bind(row_id)
            .map(|row: SqliteRow| self.map_full(row))
            .fetch_all(&self.pool)
            .await?;

        let mut same_lineage: Option<&TensorHistoryExtra> = None;
        let mut one_less: Option<&TensorHistoryExtra> = None;
        let mut next_closest: Option<&TensorHistoryExtra> = None;
        let mut highest_closest: Option<&TensorHistoryExtra> = None;

        for candidate in &candidates {
            use std::cmp::Ordering::*;

            match candidate.lineage.cmp(&lineage) {
                Equal => {
                    same_lineage = Some(candidate);
                    break;
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

        if same_lineage.is_some() {
            return Ok(vec![same_lineage.unwrap().clone()]);
        }

        let mut seen = HashSet::new();
        let mut result = Vec::new();

        for item in [one_less, next_closest, highest_closest]
            .into_iter()
            .flatten()
        {
            if seen.insert(item.row_id) {
                // or any unique field
                result.push(item.clone());
            }
        }

        Ok(result)
    }

    pub async fn get_text_history(&self) -> Result<Vec<TextHistoryNode>, Error> {
        match self.check_table(&DTProjectTable::TextHistory).await {
            Ok(_) => {}
            Err(_) => return Ok(Vec::new()),
        }

        let items: Vec<TextHistoryNode> = query("SELECT p FROM texthistorynode ORDER BY rowid")
            .map(|row: SqliteRow| {
                let p: Vec<u8> = row.get(0);
                TextHistoryNode::try_from(p.as_slice()).unwrap()
            })
            .fetch_all(&self.pool)
            .await?;

        Ok(items)
    }
}

fn import_query(has_moodboard: bool) -> String {
    let moodboard = match has_moodboard {
        true => {
            "EXISTS (
                    SELECT 1
                    FROM tensormoodboarddata AS tmd
                    WHERE
                        tmd.__pk0 = thn.__pk0
                        AND tmd.__pk1 = thn.__pk1
                ) AS has_shuffle\n"
        }
        false => "0 as has_shuffle\n",
    };

    format!(
        "
        SELECT
            thn.rowid,
            thn.p AS data_blob,

            MAX('tensor_history_'   || NULLIF(td.f20, 0)) AS tensor_id,
            MAX(td.f22) > 0 AS has_mask,
            MAX(td.f24) > 0 AS has_depth,
            MAX(td.f26) > 0 AS has_scribble,
            MAX(td.f28) > 0 AS has_pose,
            MAX(td.f30) > 0 AS has_color,
            MAX(td.f32) > 0 AS has_custom,

            {}

        FROM tensorhistorynode AS thn

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
        ON thn.__pk0 = td.__pk0
        AND thn.__pk1 = td.__pk1

        WHERE thn.rowid >= ?1
        AND thn.rowid < ?2

        GROUP BY thn.rowid
        ORDER BY thn.rowid;
        ",
        moodboard
    )
}

pub struct DTProjectInfo {
    pub _path: String,
    pub _history_count: i64,
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
    pub name: String,
    pub tensor_type: i64,
    pub data_type: i32,
    pub format: i32,
    pub width: i32,
    pub height: i32,
    pub channels: i32,
    pub dim: Vec<u8>,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TensorSize {
    pub width: i32,
    pub height: i32,
    pub channels: i32,
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
            MAX('pose_'             || NULLIF(td.f28, 0)) AS_pose_id,
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
