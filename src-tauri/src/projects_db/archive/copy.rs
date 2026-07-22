use std::{fs::OpenOptions, io::prelude::Write, path::PathBuf};

use anyhow::Result;

use sqlx::{query, AssertSqlSafe, SqlitePool};
use tokio::fs;

use crate::{
    dtp_service::AppHandleWrapper,
    projects_db::{archive::workers::copy_tensors, DtProjectRef, ProjectsDb},
};

const TENSORHISTORYNODE_OFFSETS: &[&str] = &[
    "", "__f22", "__f24", "__f48", "__f60", "__f62", "__f66", "__f70", "__f86",
];
const TENSORDATA_OFFSETS: &[&str] = &[
    "", "__f20", "__f22", "__f24", "__f26", "__f28", "__f30", "__f32",
];
const TENSORMOODBOARD_OFFSETS: &[&str] = &["", "__f10"];

#[derive(Debug)]
pub struct ArchivePlan {
    // THE DATA
    /// tensorhistorynode rowids
    pub node_ids: Vec<i64>,
    /// tensordata rowids
    pub tensordata_ids: Vec<i64>,
    /// tensormoodboarddata rowids
    pub tensormoodboarddata_ids: Vec<i64>,

    /// THE RESOURCES
    /// primary tensors, should be DtRR::Thn to link metadata
    pub primary_tensors: Vec<CopyTensorItem>,
    /// all other included tensors, should be DtRR::Tensor
    pub tensors_extra: Vec<CopyTensorItem>,

    // THE LEFT BEHIND
    /// tensors names that are not included in the archive
    pub unused_tensors: Vec<String>,
    /// tensordata rowids that will not be archived
    pub unused_tensordata: Vec<i64>,
    /// tensorhistorynodes that will not be archived
    pub unused_nodes: Vec<i64>,
    /// tensormoodboarddata that will not be archived
    pub unused_tensormoodboarddata: Vec<i64>,
}

pub async fn copy_project(
    app: AppHandleWrapper,
    project_ref: DtProjectRef,
    plan: ArchivePlan,
) -> Result<()> {
    let pdb = ProjectsDb::get().await?;
    let dtp = pdb
        .open_dt_project(project_ref)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;
    let project_name = PathBuf::from(&dtp.path)
        .file_stem()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let temp_dir = app.create_temp_dir()?;
    let dest_db_path = temp_dir.join("project.sqlite3");

    let conn_string = format!("sqlite:{}?mode=rwc", dest_db_path.display());

    // we need to use a single connection, because ATTACH is specific to one connection
    let dest_db = SqlitePool::connect(&conn_string).await?;
    let mut dest_conn = dest_db.acquire().await?;

    let schema = dtp.get_schema().await?;
    let src_db_path = dtp.path.clone();

    // copy the nedded table schemas
    for (name, sql) in schema.iter() {
        if name.starts_with("tensor") | name.starts_with("thumbnailhistory") {
            sqlx::query(AssertSqlSafe(sql.as_str()))
                .execute(&mut *dest_conn)
                .await?;
        }
    }

    // attach the source db to the dest db
    sqlx::query("ATTACH DATABASE ? AS dtp;")
        .bind(&src_db_path)
        .execute(&mut *dest_conn)
        .await?;

    copy_table_group(
        "tensorhistorynode",
        TENSORHISTORYNODE_OFFSETS,
        plan.node_ids.as_slice(),
        &mut dest_conn,
    )
    .await?;

    copy_table_group(
        "tensordata",
        TENSORDATA_OFFSETS,
        &plan.tensordata_ids,
        &mut dest_conn,
    )
    .await?;

    copy_table_group(
        "tensormoodboarddata",
        TENSORMOODBOARD_OFFSETS,
        &plan.tensormoodboarddata_ids,
        &mut dest_conn,
    )
    .await?;

    // don't let the attached connection return to the pool

    let project_ref = DtProjectRef::Db(dtp);

    copy_tensors(
        plan.primary_tensors,
        plan.tensors_extra,
        &project_ref,
        temp_dir.join("project.zip"),
        dest_conn,
    )
    .await?;

    dest_db.close().await;

    let archive_path = temp_dir.join("project.zip");
    tokio::task::spawn_blocking(move || add_file_to_zip(archive_path, dest_db_path)).await??;

    let target_path = app
        .get_home_dir()?
        .join("Documents")
        .join(format!("{}.zip", project_name));
    fs::rename(temp_dir.join("project.zip"), target_path).await?;
    fs::remove_dir_all(temp_dir).await?;

    println!("finished!");

    Ok(())
}

#[derive(Debug)]
pub struct CopyTensorItem {
    pub name: String,
    pub node_id: Option<i64>,
    pub preview_id: Option<i64>,
    pub primary: bool,
    pub index: i64,
    pub data: Option<Vec<u8>>,
    pub lossless: bool,
    pub added_to_archive: bool,
    pub error: Option<anyhow::Error>,
}

impl CopyTensorItem {
    pub fn primary(node_id: i64, tensor_name: String, preview_id: i64) -> Self {
        CopyTensorItem {
            name: tensor_name,
            node_id: Some(node_id),
            preview_id: Some(preview_id),
            primary: true,
            index: node_id,
            data: None,
            lossless: true,
            added_to_archive: false,
            error: None,
        }
    }

    pub fn extra(tensor_name: String, index: i64) -> Self {
        CopyTensorItem {
            name: tensor_name,
            node_id: None,
            preview_id: None,
            primary: false,
            index,
            data: None,
            lossless: true,
            added_to_archive: false,
            error: None,
        }
    }

    pub fn filename(&self) -> String {
        format!(
            "{}/{}.{}",
            if self.primary { "images" } else { "tensors" },
            self.name,
            if self.lossless { "png" } else { "jpg" }
        )
    }
}

async fn copy_table_group(
    table_name: &str,
    table_offsets: &[&str],
    rowids: &[i64],
    dest_conn: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
) -> Result<(), anyhow::Error> {
    // create temporary table for rowids to copy
    sqlx::query(
        "DROP TABLE IF EXISTS temp.ids; CREATE TEMP TABLE ids (rowid INTEGER PRIMARY KEY);",
    )
    .execute(&mut **dest_conn)
    .await?;

    // insert rowids
    for rowid_chunk in rowids.chunks(500) {
        let placeholders = rowid_chunk
            .iter()
            .map(|_| "(?)")
            .collect::<Vec<_>>()
            .join(",");
        let query_str = format!("INSERT INTO ids (rowid) VALUES {}", placeholders);
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
        let sql = format!(
            "INSERT INTO main.{0}
            SELECT t.*
            FROM dtp.{0} t
            JOIN ids USING (rowid)",
            table_name
        );

        query(AssertSqlSafe(sql)).execute(&mut **dest_conn).await?;
    }

    Ok(())
}

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn add_file_to_zip(archive_path: PathBuf, file_path: PathBuf) -> zip::result::ZipResult<()> {
    let archive_file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&archive_path)?;

    let mut zip = ZipWriter::new_append(archive_file)?;

    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

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

    zip.finish()?;

    Ok(())
}
