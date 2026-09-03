use tauri::State;

use crate::{dtp_service::AppHandleWrapper, projects_db::DtProjectRef, TAResult};

use super::{copy_everything_plan, copy_project, DtArchivePlan};

#[tauri::command]
pub(crate) async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    project_id: i64,
) -> TAResult<()> {
    let plan = copy_everything_plan(project_id, false).await?;
    copy_project(app.inner().clone(), DtProjectRef::Id(project_id), plan).await?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn create_dt_archive_plan(project_id: i64) -> TAResult<DtArchivePlan> {
    copy_everything_plan(project_id, false).await
}
