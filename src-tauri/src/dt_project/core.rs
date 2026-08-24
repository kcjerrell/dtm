use crate::{dt_project::history_solver::HistorySolver, projects_db::{
    PromptPair, TextHistory, archive::dt_zip::DTZip, dtos::{project::DTProjectInfo, text::TextHistoryNode},
}};
use anyhow::{anyhow, Context};
use serde::Serialize;
use sqlx::{
    query,
    sqlite::{SqliteConnection, SqliteRow},
    Connection, Row, SqlitePool,
};
use std::sync::Arc;
use tokio::sync::OnceCell;

use super::history_graph::{HistoryGraph, HistoryGraphSolver};
use super::resource::DTResource;
use super::tensor_raw::TensorRaw;
use super::types::TensorSize;

#[derive(Debug)]
pub struct DTProject {
    pub pool: Arc<SqlitePool>,
    pub path: String,
    text_history: OnceCell<Arc<TextHistory>>,
    history: OnceCell<Arc<HistoryGraph>>,
    pub tables: Arc<OnceCell<DTProjectTableStatus>>,
    pub is_shared: bool,
    pub allow_mutate: bool,
    pub dt_zip: Option<Arc<DTZip>>,
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
    ClipAudio,
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
            DTProjectTable::ClipAudio => "clip__f14",
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
    pub has_clip_audio: bool,
}

impl DTProject {
    pub(crate) async fn new(
        db_path: &str,
        is_shared: bool,
        dt_zip: Option<Arc<DTZip>>,
    ) -> anyhow::Result<Self> {
        let connect_string = format!("sqlite:{}?mode=ro", db_path);
        let pool = SqlitePool::connect(&connect_string)
            .await
            .with_context(|| format!("failed to connect to sqlite database at {}", db_path))?;

        let dtp = Self {
            pool: Arc::new(pool),
            path: db_path.to_string(),
            tables: Arc::new(OnceCell::new()),
            text_history: OnceCell::new(),
            history: OnceCell::new(),
            is_shared,
            allow_mutate: false,
            dt_zip,
        };

        dtp.check_tables().await?;
        Ok(dtp)
    }

    pub async fn check_tables(&self) -> anyhow::Result<&DTProjectTableStatus> {
        let status = self
            .tables
            .get_or_try_init(|| async {
                let tables: Vec<(String,)> = sqlx::query_as::<_, (String,)>(
                    "SELECT name FROM sqlite_master WHERE type='table';",
                )
                .fetch_all(&*self.pool)
                .await
                .with_context(|| {
                    format!("failed to query tables in project database {}", self.path)
                })?;

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
                        "clip__f14" => status.has_clip_audio = true,
                        "tensordata" => status.has_tensor_data = true,
                        _ => {}
                    }
                }
                Ok::<DTProjectTableStatus, anyhow::Error>(status)
            })
            .await?;

        Ok(status)
    }

    pub async fn check_table(&self, table: &DTProjectTable) -> anyhow::Result<bool> {
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
            DTProjectTable::ClipAudio => status.has_clip_audio,
            DTProjectTable::TensorData => status.has_tensor_data,
        };

        if !has_table {
            anyhow::bail!(
                "Table '{}' not found in project database {}",
                table.get_name(),
                self.path
            );
        }

        Ok(has_table)
    }

    pub async fn get_fingerprint(&self) -> anyhow::Result<String> {
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
        .await
        .with_context(|| {
            format!(
                "failed to query thumbnail fingerprint for project {}",
                self.path
            )
        })?;

        let fingerprint: String = row.get(0);
        Ok(fingerprint.trim_end_matches(':').to_string())
    }

    // table: tensors
    // columns: name, type, format, datatype, dim, data
    // relations: indirectly with tensordata (and its index tables)
    //            tensordata flatbuffer (and index tables) have the numeric part of the tensor name
    //            the numeric id can be joined with the type (ie: tensor_history_, depth_map_) to get
    //            the full tensor name
    pub async fn get_tensor_raw(&self, name: &str) -> anyhow::Result<TensorRaw> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row =
            query("SELECT name, type, format, datatype, dim, data FROM tensors WHERE name = ?1")
                .bind(name)
                .fetch_one(&*self.pool)
                .await
                .with_context(|| {
                    format!(
                        "failed to query raw tensor '{}' in project {}",
                        name, self.path
                    )
                })?;

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
            DTResource::dt_zip_ref(data, dt_zip).with_context(|| {
                format!("failed to resolve archived resource for tensor '{}'", name)
            })?
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
            .await
            .with_context(|| format!("failed to list tensors for project {}", self.path))?;
        Ok(tensors)
    }

    // used by front end to determine subitem display size - might not be necessary though
    // however, it might be worth keeping because it can get a tensor's size without
    // having to allocate for the tensor data
    pub async fn get_tensor_size(&self, name: &str) -> anyhow::Result<TensorSize> {
        self.check_table(&DTProjectTable::Tensors).await?;
        let row = query("SELECT datatype, dim FROM tensors WHERE name = ?1")
            .bind(name)
            .fetch_one(&*self.pool)
            .await
            .with_context(|| {
                format!(
                    "failed to query tensor size for '{}' in project {}",
                    name, self.path
                )
            })?;

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

    // used to so 'top off' scans know if the project has been updated
    pub async fn get_info(&self) -> anyhow::Result<DTProjectInfo> {
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
        .await
        .with_context(|| format!("failed to query project info for {}", self.path))?;

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
    // gets the half size preview - note: this is not a jpg, but includes a jpg. use extract_jpeg_slice
    pub async fn get_thumb_half(&self, thumb_id: i64) -> anyhow::Result<DTResource> {
        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await
            .with_context(|| format!("failed to query half thumbnail for project {}", self.path))?;
        let thumbnail: Vec<u8> = result.get(0);

        if let Some(dt_zip) = &self.dt_zip {
            DTResource::dt_zip_ref(thumbnail, dt_zip).with_context(|| {
                format!(
                    "failed to resolve archived half thumbnail for project {}",
                    self.path
                )
            })
        } else {
            Ok(DTResource::jpg_with_header(thumbnail))
        }
    }

    // gets the full size preview - note: this is not a jpg, but includes a jpg. use extract_jpeg_slice
    pub async fn get_thumb(&self, thumb_id: i64) -> anyhow::Result<DTResource> {
        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;
        let result = query("SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(&*self.pool)
            .await
            .with_context(|| format!("failed to query thumbnail for project {}", self.path))?;
        let thumbnail: Vec<u8> = result.get(0);

        if let Some(dt_zip) = &self.dt_zip {
            DTResource::dt_zip_ref(thumbnail, dt_zip).with_context(|| {
                format!(
                    "failed to resolve archived thumbnail for project {}",
                    self.path
                )
            })
        } else {
            Ok(DTResource::jpg_with_header(thumbnail))
        }
    }

    async fn get_text_history(&self) -> anyhow::Result<Arc<TextHistory>> {
        let history = self
            .text_history
            .get_or_try_init(|| async {
                if self
                    .check_table(&DTProjectTable::TextHistory)
                    .await
                    .is_err()
                {
                    return Ok::<Arc<TextHistory>, anyhow::Error>(Arc::new(TextHistory::new(
                        Vec::new(),
                        Vec::new(),
                    )));
                }

                let rows = query("SELECT rowid, p FROM texthistorynode ORDER BY rowid")
                    .fetch_all(&*self.pool)
                    .await
                    .with_context(|| {
                        format!(
                            "failed to query text history nodes for project {}",
                            self.path
                        )
                    })?;

                let nodes: Vec<TextHistoryNode> = rows
                    .into_iter()
                    .map(|row| {
                        let rowid: i64 = row.get(0);
                        let p: Vec<u8> = row.get(1);
                        TextHistoryNode::try_from(p.as_slice()).with_context(|| {
                            format!(
                                "failed to parse text history node row {} for project {}",
                                rowid, self.path
                            )
                        })
                    })
                    .collect::<anyhow::Result<Vec<_>>>()?;

                let lineages: Vec<(i64, i64)> =
                    match self.check_table(&DTProjectTable::TextLineage).await {
                        Ok(_) => query(
                            "
                SELECT tln.__pk0, tln_f6.f6 
                FROM textlineagenode tln 
                JOIN textlineagenode__f6 tln_f6 on tln.rowid = tln_f6.rowid 
                ORDER BY tln.rowid",
                        )
                        .map(|row: SqliteRow| (row.get(0), row.get(1)))
                        .fetch_all(&*self.pool)
                        .await
                        .with_context(|| {
                            format!("failed to query text lineages for project {}", self.path)
                        })?,
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
            .get_edit(lineage, edit)
            .with_context(|| format!("failed to parse text edit for project {}", self.path))?
            .ok_or_else(|| anyhow!("text edit not found for lineage {} edit {}", lineage, edit))
    }

    pub async fn get_schema(&self) -> anyhow::Result<Vec<(String, String)>> {
        let result: Vec<(String, String)> =
            sqlx::query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name != 'sqlite_sequence';")
                .map(|row: SqliteRow| (row.get("name"), row.get("sql")))
                .fetch_all(&*self.pool)
                .await
                .with_context(|| format!("failed to query sqlite schema for project {}", self.path))?;

        Ok(result)
    }

    pub async fn get_history_graph(&self) -> anyhow::Result<Arc<HistoryGraph>> {
        let history = self
            .history
            .get_or_try_init(|| async {
                let nodes = self.get_node_lineages().await?;
                let graph = HistorySolver::solve(nodes);
                Ok::<Arc<HistoryGraph>, anyhow::Error>(Arc::new(graph))
            })
            .await?
            .clone();

        Ok(history)
    }

    pub async fn get_archive_file(&self, path: &str) -> anyhow::Result<Vec<u8>> {
        if let Some(dt_zip) = &self.dt_zip {
            dt_zip
                .get_file(path)
                .await
                .with_context(|| format!("failed to read archive file '{}'", path))
        } else {
            anyhow::bail!(
                "Cannot get archived file - project is not an DTZip archive: {}",
                self.path
            )
        }
    }
}

pub async fn get_last_row(path: &str) -> anyhow::Result<(i64, i64)> {
    let connect_string = format!("sqlite:{}?mode=ro", path);
    let mut conn = SqliteConnection::connect(&connect_string)
        .await
        .with_context(|| format!("failed to connect to project database at {}", path))?;
    let row = query("SELECT max(rowid) FROM tensorhistorynode")
        .fetch_one(&mut conn)
        .await
        .with_context(|| format!("failed to query max rowid in project {}", path))?;
    let rowid: i64 = row.get(0);
    Ok((rowid, rowid))
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
