use crate::projects_db::{
    archive::dt_zip::DTZip,
    dtos::{
        clip::{ClipExtra, ClipFrame},
        project::DTProjectInfo,
        text::TextHistoryNode,
    },
    text_history::PromptPair,
    TextHistory,
};
use anyhow::anyhow;
use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::Serialize;
use sqlx::{
    query, query_as,
    sqlite::{SqliteConnection, SqliteRow},
    Connection, Error, QueryBuilder, Row, SqlitePool,
};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::OnceCell;

pub(crate) mod data;
pub(crate) mod fbs;

pub(crate) mod maintenance;
pub use maintenance::Maintenance;

mod resource;
pub use resource::*;
mod clip;
pub use clip::*;
mod tensor_data;
pub use tensor_data::*;
mod tensor_history_node;
pub use tensor_history_node::*;
mod tensor_moodboard_data;
pub use tensor_moodboard_data::*;
mod tensor_raw;
pub use tensor_raw::*;
mod types;
pub use types::*;

mod mutate;

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

#[derive(Debug)]
pub struct DTProject {
    pub pool: Arc<SqlitePool>,
    pub path: String,
    text_history: OnceCell<Arc<TextHistory>>,
    pub tables: Arc<OnceCell<DTProjectTableStatus>>,
    pub is_shared: bool,
    allow_mutate: bool,
    pub dt_zip: Option<Arc<DTZip>>,
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

#[derive(Debug, Serialize, Copy, Clone)]
pub enum DTProjectTable {
    TensorHistoryNode,
    TensorData,
    TextHistory,
    TextLineage,
    TensorMoodboardData,
    Tensors,
    ThumbnailHistoryNode,
    ThumbnailHistoryHalfNode,
    Clip,
}

impl DTProjectTable {
    pub fn get_name(&self) -> &str {
        match self {
            DTProjectTable::TensorHistoryNode => "tensorhistorynode",
            DTProjectTable::TensorData => "tensordata",
            DTProjectTable::TextHistory => "texthistory",
            DTProjectTable::TextLineage => "textlineage",
            DTProjectTable::TensorMoodboardData => "tensormoodboarddata",
            DTProjectTable::Tensors => "tensors",
            DTProjectTable::ThumbnailHistoryNode => "thumbnailhistorynode",
            DTProjectTable::ThumbnailHistoryHalfNode => "thumbnailhistoryhalfnode",
            DTProjectTable::Clip => "clip",
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct DTProjectTableStatus {
    pub has_tensor_history: bool,
    pub has_tensor_data: bool,
    pub has_text_history: bool,
    pub has_text_lineage: bool,
    pub has_moodboard: bool,
    pub has_tensors: bool,
    pub has_thumbs: bool,
    pub has_clip: bool,
}

impl DTProject {
    async fn new(
        db_path: &str,
        is_shared: bool,
        dt_zip: Option<Arc<DTZip>>,
    ) -> Result<Self, Error> {
        let connect_string = format!("sqlite:{}?mode=ro", db_path);
        let pool = SqlitePool::connect(&connect_string).await?;

        let dtp = Self {
            pool: Arc::new(pool),
            path: db_path.to_string(),
            tables: Arc::new(OnceCell::new()),
            text_history: OnceCell::new(),
            is_shared,
            allow_mutate: false,
            dt_zip,
        };

        dtp.check_tables().await?;
        Ok(dtp)
    }

    /// Creates a standalone DTProject that bypasses the cache and eviction system.
    /// Use this for long-running operations (e.g. scan_project) where the caller
    /// manages the lifetime directly. The pool closes when the DTProject is dropped.
    pub async fn open(path: &str) -> Result<DTProject, Error> {
        let mut dt_project = DTProject::new(path, false, None).await;
        if let Ok(dt_project) = &mut dt_project {
            dt_project.is_shared = false;
        }
        dt_project
    }

    pub async fn open_archive(dt_zip: Arc<DTZip>) -> Result<DTProject, Error> {
        DTProject::new(&dt_zip.db_path.to_owned(), false, Some(dt_zip)).await
    }

    pub async fn open_mut(path: &str) -> anyhow::Result<DTProject> {
        let mut dt_project = DTProject::open(path).await?;
        dt_project.allow_mutate = true;
        Ok(dt_project)
    }

    pub async fn get(path: &str) -> Result<Arc<DTProject>, Error> {
        Self::get_internal(path, None).await
    }

    pub async fn get_archive(dt_zip: Arc<DTZip>) -> Result<Arc<DTProject>, Error> {
        Self::get_internal(&dt_zip.db_path.to_owned(), Some(dt_zip)).await
    }

    async fn get_internal(path: &str, dt_zip: Option<Arc<DTZip>>) -> Result<Arc<DTProject>, Error> {
        let cell = PROJECT_CACHE
            .entry(path.to_string())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone();

        let result = cell
            .get_or_try_init(|| async {
                let project = Arc::new(DTProject::new(path, true, dt_zip).await?);
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
            .get_or_try_init(|| async {
                let tables: Vec<(String,)> = sqlx::query_as::<_, (String,)>(
                    "SELECT name FROM sqlite_master WHERE type='table';",
                )
                .fetch_all(&*self.pool)
                .await?;

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
                        "textlineage" => status.has_text_lineage = true,
                        "clip" => status.has_clip = true,
                        "tensordata" => status.has_tensor_data = true,
                        _ => {}
                    }
                }
                Ok::<DTProjectTableStatus, Error>(status)
            })
            .await?;

        Ok(status)
    }

    pub async fn check_table(&self, table: &DTProjectTable) -> Result<bool, Error> {
        let status = self.check_tables().await?;

        let has_table = match table {
            DTProjectTable::TensorHistoryNode => status.has_tensor_history,
            DTProjectTable::TextHistory => status.has_text_history,
            DTProjectTable::TextLineage => status.has_text_lineage,
            DTProjectTable::TensorMoodboardData => status.has_moodboard,
            DTProjectTable::Tensors => status.has_tensors,
            DTProjectTable::ThumbnailHistoryNode => status.has_thumbs,
            DTProjectTable::ThumbnailHistoryHalfNode => status.has_thumbs,
            DTProjectTable::Clip => status.has_clip,
            DTProjectTable::TensorData => status.has_tensor_data,
        };

        if !has_table {
            return Err(Error::Protocol("Table not found".to_string()));
        }

        Ok(has_table)
    }

    pub async fn get_fingerprint(&self) -> Result<String, Error> {
        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;

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

    // table: tensors
    // columns: name, type, format, datatype, dim, data
    // relations: indirectly with tensordata (and its index tables)
    //            tensordata flatbuffer (and index tables) have the numeric part of the tensor name
    //            the numeric id can be joined with the type (ie: tensor_history_, depth_map_) to get
    //            the full tensor name

    // KEEP - should rename to get_tensor
    pub async fn get_tensor_raw(&self, name: &str) -> anyhow::Result<TensorRaw> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row =
            query("SELECT name, type, format, datatype, dim, data FROM tensors WHERE name = ?1")
                .bind(name)
                .fetch_one(&*self.pool)
                .await?;

        let name: String = row.get(0);
        let tensor_type: i64 = row.get(1);
        let format: i32 = row.get(2);
        let data_type: i32 = row.get(3);
        let dim: Vec<u8> = row.get(4);
        let data: Vec<u8> = row.get(5);

        let n = i32::from_le_bytes(dim[0..4].try_into().ok().unwrap());
        let height = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
        let width = i32::from_le_bytes(dim[8..12].try_into().ok().unwrap());
        let channels = i32::from_le_bytes(dim[12..16].try_into().ok().unwrap());

        // If this is an archived project, interpret data as a file path
        let resource = if let Some(dt_zip) = &self.dt_zip {
            DTResource::dt_zip_ref(data, dt_zip)?
        } else {
            DTResource::compressed_tensor(data)
        };

        Ok(TensorRaw {
            name,
            tensor_type,
            format,
            data_type,
            n,
            height,
            width,
            channels,
            dim,
            resource,
        })
    }

    pub async fn list_tensors(&self) -> anyhow::Result<Vec<(i64, String)>> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let tensors = query("select rowid, name from tensors")
            .map(|row: SqliteRow| (row.get("rowid"), row.get("name")))
            .fetch_all(&*self.pool)
            .await?;
        Ok(tensors)
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
        match self.check_table(&DTProjectTable::TensorHistoryNode).await {
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
    pub async fn get_thumb_half(&self, thumb_id: i64) -> anyhow::Result<DTResource> {
        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);

        // in a dtzip project this will be a file path, within an archive

        if let Some(dt_zip) = &self.dt_zip {
            Ok(DTResource::dt_zip_ref(thumbnail, dt_zip)?)
        } else {
            Ok(DTResource::jpg_with_header(thumbnail))
        }
    }

    // KEEP - should probably just extract the jpg here
    // gets the full size preview - note: this is not a jpg, but includes a jpg. use extract_jpeg_slice
    pub async fn get_thumb(&self, thumb_id: i64) -> anyhow::Result<DTResource> {
        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;
        let result = query("SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await?;
        let thumbnail: Vec<u8> = result.get(0);

        if let Some(dt_zip) = &self.dt_zip {
            Ok(DTResource::dt_zip_ref(thumbnail, dt_zip)?)
        } else {
            Ok(DTResource::jpg_with_header(thumbnail))
        }
    }

    // returns clip frames starting from the provided first frame's node_id
    // REMOVE - replace with get_clip_and_frames
    pub async fn get_histories_from_clip(&self, node_id: i64) -> Result<Vec<ClipFrame>, Error> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;

        let nodes = self
            .get_tensor_history_nodes(Some(ThnFilter::Rowid(node_id)), None)
            .await?;
        let node = nodes.into_iter().next().ok_or(Error::RowNotFound)?;
        let num_frames = node.data().num_frames();

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
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;
        self.check_table(&DTProjectTable::Clip).await?;

        let clip: Clip = query_as("SELECT rowid, __pk0, p FROM clip where __pk0 = ?1")
            .bind(clip_id)
            .fetch_one(&*self.pool)
            .await?;

        let frames: Vec<ClipFrame> = query(CLIP_QUERY)
            .bind(node_id)
            .bind(node_id + clip.count as i64)
            .map(|row: SqliteRow| self.map_clip(row))
            .fetch_all(&*self.pool)
            .await?;

        let extra = ClipExtra {
            clip: clip.clone(),
            frames,
        };

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

        let mut qb = QueryBuilder::new("SELECT rowid, __pk0, p FROM clip WHERE __pk0 IN (");

        let mut separated = qb.separated(", ");
        for id in &clip_ids {
            separated.push_bind(id);
        }

        qb.push(")");

        let rows: Vec<Clip> = qb
            .build_query_as()
            // .map(|row: SqliteRow| Clip::map_row(&row))
            .fetch_all(&*self.pool)
            .await?;

        Ok(HashMap::from_iter(
            rows.iter().map(|c| (c.clip_id, c.count as i64)),
        ))
    }

    fn map_clip(self: &DTProject, row: SqliteRow) -> ClipFrame {
        ClipFrame::new(row.get(0), row.get(1), row.get(2)).unwrap()
    }

    // KEEP
    async fn get_text_history(&self) -> Result<Arc<TextHistory>, Error> {
        let history = self
            .text_history
            .get_or_try_init(|| async {
                if self
                    .check_table(&DTProjectTable::TextHistory)
                    .await
                    .is_err()
                {
                    return Ok::<Arc<TextHistory>, Error>(Arc::new(TextHistory::new(
                        Vec::new(),
                        Vec::new(),
                    )));
                }

                let nodes: Vec<TextHistoryNode> =
                    query("SELECT p FROM texthistorynode ORDER BY rowid")
                        .map(|row: SqliteRow| {
                            let p: Vec<u8> = row.get(0);
                            TextHistoryNode::try_from(p.as_slice()).unwrap()
                        })
                        .fetch_all(&*self.pool)
                        .await?;

                let lineages: Vec<(i64, i64)> =
                    match self.check_table(&DTProjectTable::TextLineage).await {
                        Ok(_) => {
                            query(
                                "
                SELECT tln.__pk0, tln_f6.f6 
                FROM textlineagenode tln 
                JOIN textlineagenode__f6 tln_f6 on tln.rowid = tln_f6.rowid 
                ORDER BY tln.rowid",
                            )
                            .map(|row: SqliteRow| (row.get(0), row.get(1)))
                            .fetch_all(&*self.pool)
                            .await?
                        }
                        Err(_) => Vec::new(),
                    };

                Ok(Arc::new(TextHistory::new(nodes, lineages)))
            })
            .await?
            .clone();

        Ok(history)
    }

    pub async fn get_text_edit(&self, lineage: i64, edit: i64) -> anyhow::Result<PromptPair> {
        let history = self.get_text_history().await?;
        history
            .get_edit(lineage, edit)?
            .ok_or(anyhow!("failed to get text edit"))
    }

    pub async fn get_schema(&self) -> anyhow::Result<Vec<(String, String)>> {
        let result: Vec<(String, String)> =
            sqlx::query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name != 'sqlite_sequence';")
                .map(|row: SqliteRow| (row.get("name"), row.get("sql")))
                .fetch_all(&*self.pool)
                .await?;

        Ok(result)
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
    ORDER BY thn.rowid;\n        ";

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
