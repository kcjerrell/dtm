use tauri::State;

use crate::{dtp_service::AppHandleWrapper, projects_db::DtProjectRef, TAResult};

mod cache;
mod copy;
mod copy_tensor_item;
mod dt_zip;
mod plan;
mod workers;

pub(crate) use copy::copy_project;
pub(crate) use copy_tensor_item::CopyTensorItem;
pub(crate) use plan::copy_everything_plan;
pub(crate) use workers::copy_tensors;

pub use cache::DTZipCache;
pub use dt_zip::DTZip;
pub use plan::{DtArchivePlan, DtArchivePlanItem};

#[tauri::command]
pub async fn create_dt_archive(app: State<'_, AppHandleWrapper>, project_id: i64) -> TAResult<()> {
    let plan = copy_everything_plan(project_id, false).await?;
    copy_project(app.inner().clone(), DtProjectRef::Id(project_id), plan).await?;
    Ok(())
}

#[tauri::command]
pub async fn create_dt_archive_plan(project_id: i64) -> TAResult<DtArchivePlan> {
    let plan = copy_everything_plan(project_id, false).await?;
    Ok(plan)
}
