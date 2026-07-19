use std::{path::PathBuf, sync::Arc};

use anyhow::Result;
use serde::Serialize;
use sqlx::{query, AssertSqlSafe, SqlitePool};
use tokio::{sync::Semaphore, task::JoinSet};

use crate::{
    dtp_service::AppHandleWrapper,
    projects_db::{DtProjectRef, DtResourceHandle, DtResourceRef, ProjectsDb},
    ResourceHandle,
};

const TENSORHISTORYNODE_OFFSETS: &[&str] = &[
    "", "__f22", "__f24", "__f48", "__f60", "__f62", "__f66", "__f70", "__f86",
];
const TENSORDATA_OFFSETS: &[&str] = &[
    "", "__f20", "__f22", "__f24", "__f26", "__f28", "__f30", "__f32",
];
const TENSORMOODBOARD_OFFSETS: &[&str] = &["", "__f10"];

#[derive(Debug, Serialize, Clone)]
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
    pub primary_tensors: Vec<DtResourceRef>,
    /// all other included tensors, should be DtRR::Tensor
    pub tensors_extra: Vec<DtResourceRef>,

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

    let mut temp_dir = tempfile::tempdir_in(&app.get_app_data_dir()?)?;
    temp_dir.disable_cleanup(true);
    let temp_path = temp_dir.path();
    let dest_db_path = temp_path.join("project.sqlite3");

    tokio::fs::create_dir_all(temp_path.join("images")).await?;
    tokio::fs::create_dir_all(temp_path.join("tensors")).await?;

    let conn_string = format!("sqlite:{}?mode=rwc", dest_db_path.display());

    // we need to use a single connection, because ATTACH is specific to one connection
    let dest_db = SqlitePool::connect(&conn_string).await?;
    let mut dest_conn = dest_db.acquire().await?;

    let schema = dtp.get_schema().await?;
    let src_db_path = dtp.path.clone();

    // for now we will copy every table schema
    for (name, sql) in schema.iter() {
        if name.starts_with("tensor") | name.starts_with("thumbnailhistory") {
            sqlx::query(AssertSqlSafe(sql.as_str()))
                .execute(&mut *dest_conn)
                .await?;
        }
    }

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
    _ = dest_conn.close().await?;

    let project_ref = DtProjectRef::Db(dtp);
    copy_tensors(
        &plan.primary_tensors,
        &plan.tensors_extra,
        &project_ref,
        &temp_path.into(),
    )
    .await?;

    Ok(())
}

async fn copy_tensors(
    primary: &[DtResourceRef],
    extra: &[DtResourceRef],
    project_ref: &DtProjectRef,
    out_path: &PathBuf,
) -> Result<(), anyhow::Error> {
    let mut tasks: JoinSet<anyhow::Result<()>> = JoinSet::new();
    let semaphore = Arc::new(Semaphore::new(8));

    let resources = primary.iter().chain(extra);
    for resource in resources {
        let permit = semaphore.clone().acquire_owned().await.unwrap();

        let name = resource
            .get_tensor_name()
            .ok_or(anyhow::anyhow!("tensor has no name"))?;
        let folder = match resource.is_tensor_history_node() {
            true => "images",
            false => "tensors",
        };
        let path = out_path.join(folder).join(format!("{}.png", name));
        let handle = DtResourceHandle::new(&project_ref, &resource);

        tasks.spawn(async move {
            let _permit = permit;

            let png = handle
                .get_lossless(None)
                .await?
                .ok_or(anyhow::anyhow!("couldn't get tensor image"))?;

            _ = tokio::fs::write(&path, &png).await?;

            Ok(())
        });
    }

    while let Some(task) = tasks.join_next().await {
        match task {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                println!("task err: {}", e)
            }
            Err(e) => {
                println!("task err: {}", e)
            }
        }
    }

    Ok(())
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
    Ok(for table_name in table_names {
        let sql = format!(
            "INSERT INTO main.{0}
            SELECT t.*
            FROM dtp.{0} t
            JOIN ids USING (rowid)",
            table_name
        );

        query(AssertSqlSafe(sql)).execute(&mut **dest_conn).await?;
    })
}
