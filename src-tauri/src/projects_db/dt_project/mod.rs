use crate::projects_db::{
    dt_project::raw::DTProjectRaw,
    dtos::{
        clip::{Clip, ClipExtra, ClipFrame},
        project::DTProjectInfo,
        tensor::{
            TensorHistoryExtra, TensorHistoryImport, TensorHistoryNode, TensorNodeGrouper,
            TensorRaw, TensorSize,
        },
        text::TextHistoryNode,
    },
    fbs::root_as_tensor_moodboard_data,
    tensor_history_tensor_data::TensorHistoryTensorData,
    TextHistory,
};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::Serialize;
use sqlx::{
    query, query_as,
    sqlite::{SqliteConnection, SqliteRow},
    Connection, Error, QueryBuilder, Row, SqlitePool,
};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::OnceCell;

pub mod raw;
pub use raw::dt_project_tensordata;
pub mod maintenance;
mod tensor_history_node;
pub use tensor_history_node::TensorHistoryNodeRow;

/// TTL for cached projects. After this duration of no access, the project is evicted.
const CACHE_TTL: Duration = Duration::from_secs(3);
/// Grace period after removing from cache before closing the pool,
/// allowing in-flight queries to complete.
const DRAIN_GRACE: Duration = Duration::from_millis(500);

static PROJECT_CACHE: Lazy<DashMap<String, Arc<OnceCell<Arc<CachedProject>>>>> =
    Lazy::new(DashMap::new);

struct CachedProject {
    project: Arc<DTProject>,
    generation: AtomicU64,
}

pub struct DTProject {
    pool: Arc<SqlitePool>,
    path: String,
    pub tables: Arc<OnceCell<DTProjectTableStatus>>,
    pub text_history: Arc<OnceCell<TextHistory>>,
    pub is_shared: bool,
}

pub async fn close_folder(folder_path: &str) {
    let to_remove: Vec<String> = PROJECT_CACHE
        .iter()
        .filter(|entry| entry.key().starts_with(folder_path))
        .map(|entry| entry.key().clone())
        .collect();

    for key in to_remove {
        if let Some((_, cell)) = PROJECT_CACHE.remove(&key) {
            if let Some(cached) = cell.get() {
                let pool = cached.project.pool.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(DRAIN_GRACE).await;
                    pool.close().await;
                });
            }
        }
    }
}

fn schedule_eviction(path: String, generation: u64) {
    tokio::spawn(async move {
        tokio::time::sleep(CACHE_TTL).await;

        // Only evict if no one has accessed it since we were scheduled
        let should_evict = PROJECT_CACHE
            .get(&path)
            .and_then(|cell| {
                cell.get()
                    .map(|c| c.generation.load(Ordering::Relaxed) == generation)
            })
            .unwrap_or(false);

        if should_evict {
            if let Some((_, cell)) = PROJECT_CACHE.remove(&path) {
                if let Some(cached) = cell.get() {
                    let pool = cached.project.pool.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(DRAIN_GRACE).await;
                        pool.close().await;
                    });
                }
            }
        }
    });
}

#[derive(Debug, Serialize)]
enum DTProjectTable {
    TensorHistory,
    TensorData,
    TextHistory,
    Moodboard,
    Tensors,
    Thumbs,
    Clip,
}

#[derive(Debug, Default, Clone)]
pub struct DTProjectTableStatus {
    pub has_tensor_history: bool,
    pub has_tensor_data: bool,
    pub has_text_history: bool,
    pub has_moodboard: bool,
    pub has_tensors: bool,
    pub has_thumbs: bool,
    pub has_clip: bool,
}

impl DTProject {
    async fn new(db_path: &str, is_shared: bool) -> Result<Self, Error> {
        let connect_string = format!("sqlite:{}?mode=ro", db_path);
        let pool = SqlitePool::connect(&connect_string).await?;

        let dtp = Self {
            pool: Arc::new(pool),
            path: db_path.to_string(),
            tables: Arc::new(OnceCell::new()),
            text_history: Arc::new(OnceCell::new()),
            is_shared,
        };

        dtp.check_tables().await?;
        Ok(dtp)
    }

    /// Creates a standalone DTProject that bypasses the cache and eviction system.
    /// Use this for long-running operations (e.g. scan_project) where the caller
    /// manages the lifetime directly. The pool closes when the DTProject is dropped.
    pub async fn open(path: &str) -> Result<DTProject, Error> {
        let mut dt_project = DTProject::new(path, false).await;
        if let Ok(dt_project) = &mut dt_project {
            dt_project.is_shared = false;
        }
        dt_project
    }

    pub async fn get(path: &str) -> Result<Arc<DTProject>, Error> {
        let cell = PROJECT_CACHE
            .entry(path.to_string())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone();

        let result = cell
            .get_or_try_init(|| async {
                let project = Arc::new(DTProject::new(path, true).await?);
                Ok::<Arc<CachedProject>, Error>(Arc::new(CachedProject {
                    project,
                    generation: AtomicU64::new(0),
                }))
            })
            .await;

        match result {
            Ok(cached) => {
                let gen = cached.generation.fetch_add(1, Ordering::Relaxed) + 1;
                schedule_eviction(path.to_string(), gen);
                Ok(cached.project.clone())
            }
            Err(e) => {
                // Remove the empty OnceCell so the next caller retries fresh
                PROJECT_CACHE.remove(path);
                Err(e)
            }
        }
    }

    pub async fn check_tables(&self) -> Result<&DTProjectTableStatus, Error> {
        let status = self
            .tables
            .get_or_try_init::<DTProjectTableStatus, _, _>(async || {
                let tables: Vec<(String,)> = sqlx::query_as::<_, (String,)>(
                    "SELECT name FROM sqlite_master WHERE type='table';",
                )
                .fetch_all(&*self.pool)
                .await
                .unwrap();

                let mut status = DTProjectTableStatus::default();

                for table in tables {
                    match table.0.as_str() {
                        "tensorhistorynode" => {
                            status.has_tensor_history = true;
                        }
                        "tensormoodboarddata" => status.has_moodboard = true,
                        "tensors" => status.has_tensors = true,
                        "thumbnailhistorynode" => status.has_thumbs = true,
                        "texthistorynode" => status.has_text_history = true,
                        "clip" => status.has_clip = true,
                        "tensordata" => status.has_tensor_data = true,
                        _ => {}
                    }
                }
                Ok(status)
            })
            .await
            .unwrap();

        Ok(status)
    }

    async fn check_table(&self, table: &DTProjectTable) -> Result<bool, Error> {
        let status = self.check_tables().await?;

        let has_table = match table {
            DTProjectTable::TensorHistory => status.has_tensor_history,
            DTProjectTable::TextHistory => status.has_text_history,
            DTProjectTable::Moodboard => status.has_moodboard,
            DTProjectTable::Tensors => status.has_tensors,
            DTProjectTable::Thumbs => status.has_thumbs,
            DTProjectTable::Clip => status.has_clip,
            DTProjectTable::TensorData => status.has_tensor_data,
        };

        if !has_table {
            return Err(Error::Protocol("Table not found".to_string()));
        }

        Ok(has_table)
    }

    pub async fn get_fingerprint(&self) -> Result<String, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;

        let row = query(
            "SELECT
                        group_concat(rowid || \"-\" || __pk0, \":\") AS fingerprint
                    FROM (
                        SELECT rowid, __pk0
                        FROM thumbnailhistorynode
                        ORDER BY rowid ASC
                        LIMIT 5
                    )",
        )
        .fetch_one(&*self.pool)
        .await?;

        let fingerprint: String = row.get(0);
        Ok(fingerprint.trim_end_matches(':').to_string())
    }

    // REFACTOR - should use a shared type
    pub async fn get_histories(
        &self,
        first_id: i64,
        count: usize,
    ) -> Result<Vec<TensorHistoryImport>, Error> {
        match self.check_table(&DTProjectTable::TensorHistory).await {
            Ok(_) => {}
            Err(_) => return Ok(Vec::new()),
        }

        let result: Vec<TensorHistoryTensorData> =
            query_as(&full_query_where("thn.rowid >= ?1 AND thn.rowid < ?2"))
                .bind(first_id)
                .bind(first_id + count as i64)
                .fetch_all(&*self.pool)
                .await?;

        let grouper = TensorNodeGrouper::new(&result);

        let mut items: Vec<TensorHistoryImport> = grouper.collect();

        for item in &mut items {
            if item.prompt.is_empty() && item.negative_prompt.is_empty() {
                let history = self
                    .text_history
                    .get_or_try_init(|| async {
                        let nodes = self.get_text_history().await?;
                        Ok::<TextHistory, Error>(TextHistory::new(nodes))
                    })
                    .await
                    .unwrap();

                if let Some(prompts) = history.get_edit(item.text_lineage, item.text_edits) {
                    item.prompt = prompts.positive.clone();
                    item.negative_prompt = prompts.negative.clone();
                }
            }
        }

        Ok(items)
    }

    // table: tensors
    // columns: name, type, format, datatype, dim, data
    // relations: indirectly with tensordata (and its index tables)
    //            tensordata flatbuffer (and index tables) have the numeric part of the tensor name
    //            the numeric id can be joined with the type (ie: tensor_history_, depth_map_) to get
    //            the full tensor name

    // KEEP - should rename to get_tensor
    pub async fn get_tensor_raw(&self, name: &str) -> Result<TensorRaw, Error> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row = query("SELECT type, format, datatype, dim, data FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&*self.pool)
            .await?;

        let tensor_type: i64 = row.get(0);
        let format: i32 = row.get(1);
        let data_type: i32 = row.get(2);
        let dim: Vec<u8> = row.get(3);
        let data: Vec<u8> = row.get(4);

        let n = i32::from_le_bytes(dim[0..4].try_into().ok().unwrap());
        let height = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
        let width = i32::from_le_bytes(dim[8..12].try_into().ok().unwrap());
        let channels = i32::from_le_bytes(dim[12..16].try_into().ok().unwrap());

        Ok(TensorRaw {
            name: name.to_string(),
            tensor_type,
            format,
            data_type,
            n,
            height,
            width,
            channels,
            dim,
            data,
        })
    }

    // used by front end to determine subitem display size - might not be necessary though
    // however, it might be worth keeping because it can get a tensor's size without
    // having to allocate for the tensor data
    // KEEP (maybe)
    pub async fn get_tensor_size(&self, name: &str) -> Result<TensorSize, Error> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row = query("SELECT datatype, dim FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&*self.pool)
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

    // KEEP - used to so 'top off' scans know if the project has been updated
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
        .fetch_one(&*self.pool)
        .await?;

        Ok(DTProjectInfo {
            _path: self.path.clone(),
            _history_count: result.get(0),
            history_max_id: result.get(1),
        })
    }

    // table: thumbnailhistorynode and thumbnailhalfhistorynode
    // columns: __pk0 (preview_id), p (flatbuffer with jpg)
    // relations: tensorhistorynode's flatbuffer preview_id field is __pk0
    //            this is also indexed on tensorhistorynode__f86
    //            select * from tensorhistorynode thn
    //            join tensorhistorynode__f86 thn86 on thn86.rowid = thn.rowid
    //            join thumbnailhistorynode th on th.__pk0 = thn86.f86
    // KEEP - should probably just extract the jpg here
    // gets the half size preview - note: this is not a jpg, but includes a jpg. use extract_jpeg_slice
    pub async fn get_thumb_half(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    // KEEP - should probably just extract the jpg here
    // gets the full size preview - note: this is not a jpg, but includes a jpg. use extract_jpeg_slice
    pub async fn get_thumb(&self, thumb_id: i64) -> Result<Vec<u8>, Error> {
        self.check_table(&DTProjectTable::Thumbs).await?;
        let result = query("SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);
        Ok(thumbnail)
    }

    // returns of clip frames from the provided first frame
    // REMOVE - replace wth get_clip_and_frames
    pub async fn get_histories_from_clip(&self, node_id: i64) -> Result<Vec<ClipFrame>, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;

        let history = self.get_history_full(node_id).await?;
        let num_frames = history.history.num_frames;

        let items: Vec<ClipFrame> = query(CLIP_QUERY)
            .bind(node_id)
            .bind(node_id + num_frames as i64)
            .map(|row: SqliteRow| self.map_clip(row))
            .fetch_all(&*self.pool)
            .await?;

        Ok(items)
    }

    // KEEP - however, the clip_id param should be removed, and instead obtained with an additional
    // query for the node. this is only used for one clip at a time, and even though one usage is
    // somewhat latency sensitive (video on hover), it should still be fast enough
    pub async fn get_clip_and_frames(
        &self,
        node_id: i64,
        clip_id: i64,
    ) -> Result<ClipExtra, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;
        self.check_table(&DTProjectTable::Clip).await?;

        let clip: Clip = query("SELECT * FROM clip where __pk0 = ?1")
            .bind(clip_id)
            .map(|row: SqliteRow| Clip::map_row(&row))
            .fetch_one(&*self.pool)
            .await?;

        let frames: Vec<ClipFrame> = query(CLIP_QUERY)
            .bind(node_id)
            .bind(node_id + clip.count as i64)
            .map(|row: SqliteRow| self.map_clip(row))
            .fetch_all(&*self.pool)
            .await?;

        let extra = ClipExtra { clip, frames };

        Ok(extra)
    }

    // this is used when importing to get the frame count for video items
    // KEEP - however, these are small enough that we can just return the whole table.
    // the import process should call this once per import, instead of once per batch
    pub async fn get_clip_counts(&self, clip_ids: Vec<i64>) -> Result<HashMap<i64, i64>, Error> {
        if clip_ids.is_empty() {
            return Ok(HashMap::new());
        }

        self.check_table(&DTProjectTable::Clip).await?;

        let mut qb = QueryBuilder::new("SELECT * FROM clip WHERE __pk0 IN (");

        let mut separated = qb.separated(", ");
        for id in &clip_ids {
            separated.push_bind(id);
        }

        qb.push(")");

        let rows: Vec<Clip> = qb.build_query_as::<Clip>().fetch_all(&*self.pool).await?;

        Ok(HashMap::from_iter(
            rows.iter().map(|c| (c.clip_id, c.count as i64)),
        ))
    }

    fn map_clip(self: &DTProject, row: SqliteRow) -> ClipFrame {
        ClipFrame::new(row.get(0), row.get(1), row.get(2)).unwrap()
    }

    // REFACTOR - TensorHistoryExtra should be combined/replaced with similar types
    pub async fn get_history_full(&self, row_id: i64) -> Result<TensorHistoryExtra, Error> {
        self.check_table(&DTProjectTable::TensorHistory).await?;
        let result: Vec<TensorHistoryTensorData> = query_as(&full_query_where("thn.rowid == ?1"))
            .bind(row_id)
            .fetch_all(&*self.pool)
            .await?;

        let mut item = TensorHistoryExtra::from((result, self.path.clone()));

        item.moodboard = self
            .get_shuffle_ids(item.lineage, item.logical_time)
            .await?;

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

    // REFACTOR - TensorHistoryExtra should be combined/replaced with similar types
    // this function be reworked into a another get_history function, that has an option for
    // including the clip data, and the return type should have Option<Clip>
    // or possibly Option<Option<Clip>> to indicate that clip was part of the query but the item
    // did not have one
    pub async fn get_history_with_clip(
        &self,
        row_id: i64,
        clip_id: i64,
    ) -> Result<(TensorHistoryExtra, Clip), Error> {
        let history = self.get_history_full(row_id).await?;

        self.check_table(&DTProjectTable::Clip).await?;

        let clip: Clip = query("SELECT * FROM clip where __pk0 = ?1")
            .bind(clip_id)
            .map(|row: SqliteRow| Clip::map_row(&row))
            .fetch_one(&*self.pool)
            .await?;

        Ok((history, clip))
    }

    // returns the moodboard ids for a lineage/logical time
    // KEEP
    pub async fn get_shuffle_ids(
        &self,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<(String, f32)>, Error> {
        if self.check_table(&DTProjectTable::Moodboard).await.is_err() {
            return Ok(Vec::new());
        }

        let shuffle: Vec<Vec<u8>> = query(
            "SELECT p FROM tensormoodboarddata AS tmd
            WHERE tmd.__pk0 == ?1 AND tmd.__pk1 == ?2",
        )
        .bind(lineage)
        .bind(logical_time)
        .map(|row: SqliteRow| row.get(0))
        .fetch_all(&*self.pool)
        .await?;

        let mut moodboard: Vec<(String, f32)> = Vec::new();

        for s in shuffle {
            let data = root_as_tensor_moodboard_data(&s).unwrap();
            moodboard.push((format!("shuffle_{}", data.shuffle_id()), data.weight()));
        }

        Ok(moodboard)
    }

    // KEEP... for now
    pub async fn find_predecessor_candidates(
        &self,
        row_id: i64,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<TensorHistoryExtra>, Error> {
        // Ok(Vec::new())

        self.check_table(&DTProjectTable::TensorHistory).await?;
        let q = &full_query_where("thn.__pk1 == ?1 AND thn.rowid < ?2");
        let candidates: Vec<TensorHistoryTensorData> = query_as(q)
            .bind(logical_time - 1)
            .bind(row_id)
            .fetch_all(&*self.pool)
            .await?;

        let mut same_lineage: Option<&TensorHistoryTensorData> = None;
        let mut one_less: Option<&TensorHistoryTensorData> = None;
        let mut next_closest: Option<&TensorHistoryTensorData> = None;
        let mut highest_closest: Option<&TensorHistoryTensorData> = None;

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
            return Ok(vec![
                self.get_history_full(same_lineage.unwrap().node_id).await?,
            ]);
        }

        let mut seen = HashSet::new();
        let mut result = Vec::new();

        for item in [one_less, next_closest, highest_closest]
            .into_iter()
            .flatten()
        {
            if seen.insert(item.node_id) {
                // or any unique field
                result.push(item.clone());
            }
        }
        let mut full_result = Vec::new();
        for item in result {
            full_result.push(self.get_history_full(item.node_id).await?);
        }

        Ok(full_result)
    }

    // KEEP
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
            .fetch_all(&*self.pool)
            .await?;

        Ok(items)
    }

    pub fn raw(&'_ self) -> DTProjectRaw<'_> {
        DTProjectRaw::new(self)
    }
}

pub async fn get_last_row(path: &str) -> Result<(i64, i64), Error> {
    let connect_string = format!("sqlite:{}?mode=ro", path);
    let mut conn = SqliteConnection::connect(&connect_string).await?;
    let row = query("SELECT max(rowid) FROM tensorhistorynode")
        .fetch_one(&mut conn)
        .await?;
    let rowid: i64 = row.get(0);
    Ok((rowid, rowid))
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
    ORDER BY thn.rowid;
        ";

fn full_query_where(where_expr: &str) -> String {
    format!(
        "
        SELECT
            thn.rowid,
            thn.__pk0 as lineage,
            thn.__pk1 as logical_time,
            td.__pk2 as td_index,
            thn.p AS node_data,
            td.p AS tensor_data
        FROM tensorhistorynode AS thn
        LEFT JOIN tensordata AS td
            ON td.__pk0 = thn.__pk0
            AND td.__pk1 = thn.__pk1
        WHERE td.__pk2 IS NOT NULL
            AND {}
        ORDER BY thn.rowid, td.__pk2 ASC;
        ",
        where_expr
    )
}

pub enum ProjectRef {
    Id(i64),
}

impl From<i64> for ProjectRef {
    fn from(value: i64) -> Self {
        ProjectRef::Id(value)
    }
}

/*
SELECT
    thn.rowid,
    thn.__pk0 as lineage,
    thn.__pk1 as logical_time,
    td.__pk2 as td_index,
    thn.p AS node_data,
    td.p AS tensor_data
FROM tensorhistorynode AS thn
LEFT JOIN tensordata AS td
    ON td.__pk0 = thn.__pk0
   AND td.__pk1 = thn.__pk1
-- WHERE thn.rowid >= ?1
--   AND thn.rowid < ?2
ORDER BY thn.rowid, td.__pk2 DESC;

*/
