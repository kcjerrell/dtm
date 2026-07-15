use std::path::PathBuf;

use anyhow::Result;
use sqlx::{AssertSqlSafe, SqlitePool};

use crate::{
    dtp_service::AppHandleWrapper,
    projects_db::{projects_db::MixedError, DTProject, DtProjectRef, ProjectsDb},
};

pub async fn copy_project(
    app: AppHandleWrapper,
    project_ref: DtProjectRef,
) -> Result<()> {
    let pdb = ProjectsDb::get().await?;
    let dtp = pdb.open_dt_project(project_ref).await.map_err(|e| anyhow::anyhow!(e))?;

    let mut temp_dir = tempfile::tempdir_in(&app.get_app_data_dir()?)?;
    temp_dir.disable_cleanup(true);
    let temp_path = temp_dir.path();
    let dest_db_path = temp_path.join("project.sqlite3");

    let conn_string = format!("sqlite:{}?mode=rwc", dest_db_path.display());

    let dest_db = SqlitePool::connect(&conn_string).await?;
    let mut dest_conn = dest_db.acquire().await?;

    let schema = dtp.get_schema().await?;
    let src_db_path = dtp.path.clone();

    for (_, sql) in schema.iter() {
        sqlx::query(AssertSqlSafe(sql.as_str())).execute(&mut *dest_conn).await?;
    }

    sqlx::query("ATTACH DATABASE ? AS dtp;").bind(&src_db_path).execute(&mut *dest_conn).await?;

    for (table, _) in schema.iter() {
        match table.as_str() {
            "tensors" | "thumbnailhistorynode" | "thumbnailhistoryhalfnode" => {
                continue;
            }
            _ => {
                // Copy data from source to destination
                let query = format!("INSERT INTO main.{} SELECT * FROM dtp.{};", table, table);
                sqlx::query(AssertSqlSafe(query)).execute(&mut *dest_conn).await?;
            }
        }
    }

    Ok(())
}
