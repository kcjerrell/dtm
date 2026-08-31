use std::{fs::OpenOptions, io::prelude::Write, path::PathBuf, time::Instant};

use anyhow::{Context, Result};

use sqlx::{query, AssertSqlSafe, SqlitePool};
use tokio::fs;

use crate::{dtp_service::AppHandleWrapper, projects_db::DtProjectRef};

use super::{copy_tensors, DtArchivePlan, CopyTensorItem};

const TENSORHISTORYNODE_OFFSETS: &[&str] = &[
    "", "__f22", "__f24", "__f48", "__f60", "__f62", "__f66", "__f70", "__f86",
];
const TENSORDATA_OFFSETS: &[&str] = &[
    "", "__f20", "__f22", "__f24", "__f26", "__f28", "__f30", "__f32",
];
const TENSORMOODBOARD_OFFSETS: &[&str] = &["", "__f10"];
const CLIP_OFFSETS: &[&str] = &["", "__f14"];

pub async fn copy_project(
    app: AppHandleWrapper,
    project_ref: DtProjectRef,
    plan: DtArchivePlan,
) -> Result<()> {
    let start = Instant::now();
    let total_items = plan.primary_tensors.len() + plan.tensors_extra.len();
    log::debug!("starting copy for {} items", total_items);
    let dtp = project_ref
        .open_project()
        .await
        .context("failed to open source project for archiving")?;
    let project_name = PathBuf::from(&dtp.path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string());

    let temp_dir = app
        .create_temp_dir()
        .context("failed to create temporary directory for archive creation")?;
    let dest_db_path = temp_dir.join("project.dtm");

    let conn_string = format!("sqlite:{}?mode=rwc", dest_db_path.display());

    let dest_db = SqlitePool::connect(&conn_string).await.with_context(|| {
        format!(
            "failed to connect to archive database at {}",
            dest_db_path.display()
        )
    })?;
    let mut dest_conn = dest_db
        .acquire()
        .await
        .context("failed to acquire connection to archive database")?;

    let schema = dtp
        .get_schema()
        .await
        .context("failed to retrieve source database schema")?;
    let src_db_path = dtp.path.clone();

    for (name, sql) in schema.iter() {
        if name.starts_with("tensor")
            | name.starts_with("thumbnailhistory")
            | name.starts_with("clip")
        {
            sqlx::query(AssertSqlSafe(sql.as_str()))
                .execute(&mut *dest_conn)
                .await
                .with_context(|| {
                    format!("failed to recreate table schema for '{name}' in archive")
                })?;
        }
    }

    sqlx::query("ATTACH DATABASE ? AS dtp;")
        .bind(&src_db_path)
        .execute(&mut *dest_conn)
        .await
        .with_context(|| format!("failed to attach source database '{src_db_path}'"))?;

    copy_table_group_all(
        "tensorhistorynode",
        TENSORHISTORYNODE_OFFSETS,
        &mut dest_conn,
    )
    .await
    .context("failed to copy 'tensorhistorynode' tables")?;

    copy_table_group_all("tensordata", TENSORDATA_OFFSETS, &mut dest_conn)
        .await
        .context("failed to copy 'tensordata' tables")?;

    copy_table_group_all(
        "tensormoodboarddata",
        TENSORMOODBOARD_OFFSETS,
        &mut dest_conn,
    )
    .await
    .context("failed to copy 'tensormoodboarddata' tables")?;

    copy_table_group_all("clip", CLIP_OFFSETS, &mut dest_conn)
        .await
        .context("failed to copy 'clip' tables")?;

    let project_ref = DtProjectRef::Db(dtp);

    copy_tensors(
        plan.primary_tensors
            .into_iter()
            .map(CopyTensorItem::primary)
            .collect(),
        plan.tensors_extra
            .into_iter()
            .map(CopyTensorItem::extra)
            .collect(),
        &project_ref,
        temp_dir.join("project.zip"),
        dest_conn,
        plan.lossless,
    )
    .await
    .context("failed to process and pack tensor items into archive")?;

    dest_db.close().await;

    let archive_path = temp_dir.join("project.zip");
    let dest_db_path_clone = dest_db_path.clone();
    tokio::task::spawn_blocking(move || add_files_to_zip(archive_path, vec![dest_db_path_clone]))
        .await
        .context("failed to append database file to archive zip")??;

    let target_path = app
        .get_home_dir()
        .context("failed to get user home directory")?
        .join("Documents")
        .join(format!("{}.dtm.zip", project_name));
    let rename_result = fs::rename(&temp_dir.join("project.zip"), &target_path).await;

    if let Err(e) = fs::remove_dir_all(&temp_dir).await {
        log::error!(
            "failed to remove temp directory '{}': {}",
            temp_dir.display(),
            e
        );
    }

    rename_result
        .with_context(|| format!("failed to move archive to {}", target_path.display()))?;

    let duration = start.elapsed();
    println!(
        "finished in {:?} for {:?} items ({:.1}ms per item)",
        duration,
        total_items,
        0.001 * duration.as_micros() as f64 / total_items as f64
    );

    Ok(())
}

#[allow(dead_code)]
async fn copy_table_group_by_ids(
    table_name: &str,
    table_offsets: &[&str],
    rowids: &[i64],
    id_column: &str,
    dest_conn: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
) -> Result<(), anyhow::Error> {
    let tables: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE ?")
            .bind(format!("{}%", table_name))
            .fetch_all(&mut **dest_conn)
            .await?;

    if tables.is_empty() {
        return Ok(());
    }

    // create temporary table for rowids to copy
    sqlx::query(AssertSqlSafe(format!(
        "DROP TABLE IF EXISTS temp.ids; CREATE TEMP TABLE ids ({} INTEGER PRIMARY KEY);",
        id_column
    )))
    .execute(&mut **dest_conn)
    .await?;

    // insert rowids
    for rowid_chunk in rowids.chunks(500) {
        let placeholders = rowid_chunk
            .iter()
            .map(|_| "(?)")
            .collect::<Vec<_>>()
            .join(",");
        let query_str = format!("INSERT INTO ids ({}) VALUES {}", id_column, placeholders);
        let mut q = query(AssertSqlSafe(query_str));
        for id in rowid_chunk {
            q = q.bind(id);
        }
        q.execute(&mut **dest_conn).await?;
    }

    // get the table names
    let table_names = table_offsets
        .iter()
        .map(|&offset| format!("{}{}", table_name, offset))
        .collect::<Vec<_>>();

    // copy each table
    for table_name in table_names {
        if !tables.contains(&table_name) {
            continue;
        }
        let sql = format!(
            "INSERT INTO main.{0}
            SELECT t.*
            FROM dtp.{0} t
            JOIN ids USING ({1})",
            table_name, id_column
        );

        query(AssertSqlSafe(sql)).execute(&mut **dest_conn).await?;
    }

    Ok(())
}

async fn copy_table_group_all(
    table_name: &str,
    table_offsets: &[&str],
    dest_conn: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
) -> Result<(), anyhow::Error> {
    let tables: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE ?")
            .bind(format!("{}%", table_name))
            .fetch_all(&mut **dest_conn)
            .await?;

    if tables.is_empty() {
        return Ok(());
    }

    // get the table names
    let table_names = table_offsets
        .iter()
        .map(|&offset| format!("{}{}", table_name, offset))
        .collect::<Vec<_>>();

    // copy each table
    for table_name in table_names {
        if !tables.contains(&table_name) {
            continue;
        }
        let sql = format!(
            "INSERT INTO main.{0}
            SELECT *
            FROM dtp.{0}",
            table_name
        );

        query(AssertSqlSafe(sql)).execute(&mut **dest_conn).await?;
    }

    Ok(())
}

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn add_files_to_zip(archive_path: PathBuf, file_paths: Vec<PathBuf>) -> zip::result::ZipResult<()> {
    let archive_file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&archive_path)?;

    let mut zip = ZipWriter::new_append(archive_file)?;

    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for file_path in file_paths {
        let file_name = file_path
            .file_name()
            .ok_or(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "path has no file name",
            ))?
            .to_string_lossy();

        zip.start_file(file_name, options)?;

        let contents = std::fs::read(&file_path)?;
        zip.write_all(&contents)?;
    }

    zip.finish()?;

    Ok(())
}
