use tauri::State;

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        archive::{
            copy::copy_project,
            plan::{copy_everything_plan, ArchivePlan},
        },
        DtProjectRef,
    },
    TAResult,
};

pub(crate) mod cache;
mod copy;
pub(crate) mod copy_tensor_item;
pub(crate) mod dt_zip;
pub mod plan;
pub(crate) mod workers;

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<()> {
    let plan = copy_everything_plan(&dtp, project_id, false).await?;
    copy_project(app.inner().clone(), DtProjectRef::Id(project_id), plan).await?;
    Ok(())
}

#[tauri::command]
pub async fn create_dt_archive_plan(
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<ArchivePlan> {
    let plan = copy_everything_plan(&dtp, project_id, false).await?;
    Ok(plan)
}
