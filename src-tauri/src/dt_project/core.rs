use crate::{
    archive::DTZip,
    dt_project::history_solver::HistorySolver,
    projects_db::{
        dtos::{project::DTProjectInfo, text::TextHistoryNode},
        PromptPair, TextHistory,
    },
};
use anyhow::{anyhow, Context};
use serde::Serialize;
use sqlx::{
    query, query_as,
    sqlite::{SqliteConnection, SqlitePoolOptions, SqliteRow},
    AssertSqlSafe, Connection, Row, SqlitePool,
};
use std::{os::unix::fs::MetadataExt, path::PathBuf, sync::Arc};
use tokio::{fs, sync::OnceCell};

use super::history_graph::{HistoryGraph, HistoryNode};
use super::resource::DTResource;
use super::tensor_raw::TensorRaw;
use super::types::TensorSize;

#[derive(Debug)]
pub struct DTProject {
    pool: OnceCell<Arc<SqlitePool>>,
    pool_options: SqlitePoolOptions,
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
        Self::new_with_pool(
            db_path,
            is_shared,
            dt_zip,
            sqlx::sqlite::SqlitePoolOptions::new(),
        )
        .await
    }

    pub(crate) async fn new_with_pool(
        db_path: &str,
        is_shared: bool,
        dt_zip: Option<Arc<DTZip>>,
        options: SqlitePoolOptions,
    ) -> anyhow::Result<Self> {
        let is_archive = dt_zip.is_some();
        let dtp = Self {
            pool: OnceCell::new(),
            pool_options: options,
            path: db_path.to_string(),
            tables: Arc::new(OnceCell::new()),
            text_history: OnceCell::new(),
            history: OnceCell::new(),
            is_shared,
            allow_mutate: false,
            dt_zip,
        };

        if !is_archive {
            dtp.check_tables().await?;
        }
        Ok(dtp)
    }

    pub async fn pool(&self) -> anyhow::Result<&SqlitePool> {
        let pool = self
            .pool
            .get_or_try_init(|| async {
                if let Some(dt_zip) = &self.dt_zip {
                    dt_zip.ensure_db_extracted().await.with_context(|| {
                        format!(
                            "failed to materialize database '{}' from zip archive '{}'",
                            self.path, dt_zip.archive_path
                        )
                    })?;
                }

                let connect_string = format!("sqlite:{}?mode=ro", self.path);
                let pool = self
                    .pool_options
                    .clone()
                    .connect(&connect_string)
                    .await
                    .with_context(|| {
                        if let Some(dt_zip) = &self.dt_zip {
                            format!(
                                "failed to connect to extracted sqlite database '{}' from zip archive '{}'",
                                self.path, dt_zip.archive_path
                            )
                        } else {
                            format!("failed to connect to sqlite database at {}", self.path)
                        }
                    })?;
                Ok::<Arc<SqlitePool>, anyhow::Error>(Arc::new(pool))
            })
            .await?;
        Ok(pool)
    }

    pub(crate) fn initialized_pool(&self) -> Option<Arc<SqlitePool>> {
        self.pool.get().cloned()
    }

    pub async fn check_tables(&self) -> anyhow::Result<&DTProjectTableStatus> {
        let status = self
            .tables
            .get_or_try_init(|| async {
                let pool = self.pool().await?;
                let tables: Vec<(String,)> = sqlx::query_as::<_, (String,)>(
                    "SELECT name FROM sqlite_master WHERE type='table';",
                )
                .fetch_all(pool)
                .await
                .with_context(|| {
                    if let Some(dt_zip) = &self.dt_zip {
                        format!(
                            "failed to query tables in extracted project database '{}' from zip archive '{}'",
                            self.path, dt_zip.archive_path
                        )
                    } else {
                        format!("failed to query tables in project database {}", self.path)
                    }
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
        .fetch_one(self.pool().await?)
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
                .fetch_one(self.pool().await?)
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
            .fetch_all(self.pool().await?)
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
            .fetch_one(self.pool().await?)
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
        .fetch_one(self.pool().await?)
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
        if let Some(dt_zip) = &self.dt_zip {
            let rel_path = format!("thumbhalf/{thumb_id}.jpg");
            if dt_zip.contains_file(&rel_path).await.with_context(|| {
                format!(
                    "failed to inspect entry '{}' in zip archive '{}'",
                    rel_path, dt_zip.archive_path
                )
            })? {
                return Ok(DTResource::dt_zip_path(rel_path, dt_zip));
            }
        }

        self.check_table(&DTProjectTable::ThumbnailHistoryNode)
            .await?;
        let result = query("SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1")
            .bind(thumb_id)
            .fetch_one(self.pool().await?)
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
            .fetch_one(self.pool().await?)
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

    pub async fn get_thumbs_stats(&self, half: bool) -> anyhow::Result<(u64, u64)> {
        let q = if half {
            self.check_table(&DTProjectTable::ThumbnailHistoryHalfNode)
                .await?;
            "select count(*), sum(length(p)) from thumbnailhistoryhalfnode"
        } else {
            self.check_table(&DTProjectTable::ThumbnailHistoryNode)
                .await?;
            "select count(*), sum(length(p)) from thumbnailhistorynode"
        };
        let (count, sum): (u64, u64) = query_as(AssertSqlSafe(q))
            .fetch_one(self.pool().await?)
            .await?;
        Ok((count, sum))
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
                    .fetch_all(self.pool().await?)
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
                        .fetch_all(self.pool().await?)
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
                .fetch_all(self.pool().await?)
                .await
                .with_context(|| format!("failed to query sqlite schema for project {}", self.path))?;

        Ok(result)
    }

    pub async fn get_node_lineages(&self) -> anyhow::Result<Vec<HistoryNode>> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;
        let nodes: Vec<HistoryNode> =
            query_as("SELECT rowid, __pk0, __pk1 FROM tensorhistorynode ORDER BY rowid ASC")
                .fetch_all(self.pool().await?)
                .await
                .with_context(|| {
                    format!(
                        "failed to query node lineages in project database {}",
                        self.path
                    )
                })?;

        Ok(nodes)
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

    pub async fn get_db_file_size(&self) -> anyhow::Result<u64> {
        let path = PathBuf::from(&self.path);
        let metadata_db = fs::metadata(&path).await.with_context(|| {
            format!(
                "failed to get metadata for project database at {}",
                self.path
            )
        })?;

        let wal_path = path.with_extension("sqlite3-wal");
        let wal_size = match fs::try_exists(&wal_path).await.unwrap_or(false) {
            true => fs::metadata(&wal_path).await.map(|m| m.size()).unwrap_or(0),
            false => 0,
        };

        Ok(metadata_db.size() + wal_size)
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

#[cfg(test)]
mod tests {
    use std::{io::Write, path::Path, sync::Arc};

    use tempfile::{tempdir, TempDir};
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    use super::*;

    async fn create_thumbnail_db(path: &Path) -> anyhow::Result<()> {
        let connect_string = format!("sqlite:{}?mode=rwc", path.to_string_lossy());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&connect_string)
            .await?;
        sqlx::query(
            "CREATE TABLE thumbnailhistorynode (__pk0 INTEGER PRIMARY KEY, p BLOB NOT NULL)",
        )
        .execute(&pool)
        .await?;
        sqlx::query(
            "CREATE TABLE thumbnailhistoryhalfnode (__pk0 INTEGER PRIMARY KEY, p BLOB NOT NULL)",
        )
        .execute(&pool)
        .await?;
        sqlx::query("INSERT INTO thumbnailhistorynode (__pk0, p) VALUES (42, ?1)")
            .bind(b"thumb/42.jpg".as_slice())
            .execute(&pool)
            .await?;
        sqlx::query("INSERT INTO thumbnailhistoryhalfnode (__pk0, p) VALUES (42, ?1)")
            .bind(b"legacy/42.jpg".as_slice())
            .execute(&pool)
            .await?;
        pool.close().await;
        Ok(())
    }

    fn write_archive(
        path: &Path,
        db: &[u8],
        include_deterministic_half: bool,
    ) -> anyhow::Result<()> {
        let file = std::fs::File::create(path)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("project.dtm", options)?;
        zip.write_all(db)?;
        zip.start_file("legacy/42.jpg", options)?;
        zip.write_all(b"legacy half")?;
        zip.start_file("thumb/42.jpg", options)?;
        zip.write_all(b"full thumbnail")?;
        if include_deterministic_half {
            zip.start_file("thumbhalf/42.jpg", options)?;
            zip.write_all(b"direct half")?;
        }
        zip.finish()?;
        Ok(())
    }

    async fn archive_project(
        include_deterministic_half: bool,
    ) -> anyhow::Result<(TempDir, Arc<DTZip>, DTProject)> {
        let dir = tempdir()?;
        let source_db = dir.path().join("source.dtm");
        create_thumbnail_db(&source_db).await?;
        let archive_path = dir.path().join("project.dtm.zip");
        write_archive(
            &archive_path,
            &fs::read(&source_db).await?,
            include_deterministic_half,
        )?;
        let archive = Arc::new(
            DTZip::new(
                archive_path.to_string_lossy().as_ref(),
                dir.path().to_string_lossy().as_ref(),
            )
            .await?,
        );
        let project = DTProject::open_archive(archive.clone()).await?;
        Ok((dir, archive, project))
    }

    #[tokio::test]
    async fn regular_projects_eagerly_initialize_pool_and_tables() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("regular.dtm");
        create_thumbnail_db(&db_path).await?;

        let project = DTProject::open(db_path.to_string_lossy().as_ref()).await?;

        assert!(project.initialized_pool().is_some());
        assert!(project.tables.get().is_some());
        assert!(matches!(
            project.get_thumb_half(42).await?,
            DTResource::JpgInFbs(_)
        ));
        Ok(())
    }

    #[tokio::test]
    async fn snapshot_projects_keep_the_single_initialized_pool() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("snapshot.dtm");
        create_thumbnail_db(&db_path).await?;

        let project = DTProject::open_snapshot(db_path.to_string_lossy().as_ref()).await?;
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM thumbnailhistorynode")
            .fetch_one(project.pool().await?)
            .await?;

        assert_eq!(count, 1);
        assert!(project.initialized_pool().is_some());
        assert!(project.tables.get().is_some());
        Ok(())
    }

    #[tokio::test]
    async fn deterministic_archive_half_thumbnail_stays_database_lazy() -> anyhow::Result<()> {
        let (_dir, archive, project) = archive_project(true).await?;
        assert_eq!(fs::metadata(&archive.db_path).await?.len(), 0);
        assert!(project.initialized_pool().is_none());
        assert!(project.tables.get().is_none());

        let resource = project.get_thumb_half(42).await?;
        let DTResource::DTZipRef(reference) = resource else {
            anyhow::bail!("expected an archive reference");
        };
        assert_eq!(reference.rel_path, "thumbhalf/42.jpg");
        assert_eq!(
            project.get_archive_file(&reference.rel_path).await?,
            b"direct half"
        );
        assert_eq!(fs::metadata(&archive.db_path).await?.len(), 0);
        assert!(project.initialized_pool().is_none());
        assert!(project.tables.get().is_none());
        Ok(())
    }

    #[tokio::test]
    async fn missing_deterministic_half_falls_back_to_database() -> anyhow::Result<()> {
        let (_dir, archive, project) = archive_project(false).await?;

        let resource = project.get_thumb_half(42).await?;
        let DTResource::DTZipRef(reference) = resource else {
            anyhow::bail!("expected an archive reference");
        };
        assert_eq!(reference.rel_path, "legacy/42.jpg");
        assert_eq!(
            project.get_archive_file(&reference.rel_path).await?,
            b"legacy half"
        );
        assert!(fs::metadata(&archive.db_path).await?.len() > 0);
        assert!(project.initialized_pool().is_some());
        assert!(project.tables.get().is_some());
        Ok(())
    }

    #[tokio::test]
    async fn unknown_archive_preview_ids_use_the_database_fallback() -> anyhow::Result<()> {
        let (_dir, archive, project) = archive_project(true).await?;

        let error = project.get_thumb_half(-1).await.unwrap_err();

        assert!(error.to_string().contains("failed to query half thumbnail"));
        assert!(fs::metadata(&archive.db_path).await?.len() > 0);
        assert!(project.initialized_pool().is_some());
        Ok(())
    }

    #[tokio::test]
    async fn archive_pool_initialization_is_shared_and_full_thumbnails_use_it() -> anyhow::Result<()>
    {
        let (_dir, archive, project) = archive_project(true).await?;
        let project = Arc::new(project);

        let (first, second, direct_half) =
            tokio::join!(project.pool(), project.pool(), project.get_thumb_half(42));
        assert!(std::ptr::eq(first?, second?));
        assert!(matches!(direct_half?, DTResource::DTZipRef(_)));

        let full = project.get_thumb(42).await?;
        let DTResource::DTZipRef(reference) = full else {
            anyhow::bail!("expected an archive reference");
        };
        assert_eq!(reference.rel_path, "thumb/42.jpg");
        assert_eq!(
            project.get_archive_file(&reference.rel_path).await?,
            b"full thumbnail"
        );
        assert!(fs::metadata(&archive.db_path).await?.len() > 0);
        Ok(())
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
