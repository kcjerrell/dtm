use tauri::State;

use crate::{dtp_service::AppHandleWrapper, projects_db::DtProjectRef, TAResult};

mod cache;
mod commands;
mod copy;
mod copy_tensor_item;
mod dt_zip;
mod plan;
mod workers;

pub(crate) use copy::copy_project;
pub(crate) use copy_tensor_item::CopyTensorItem;
pub(crate) use workers::copy_tensors;

pub use commands::create_dt_archive_plan;

pub use cache::DTZipCache;
pub use dt_zip::DTZip;
pub use plan::{
    CreateDtArchiveOptions, DtArchivePlan, DtArchivePlanItem, DtArchivePreview, TensorCounts,
};

use plan::copy_everything_plan;

#[tauri::command]
pub async fn create_dt_archive(app: State<'_, AppHandleWrapper>, project_id: i64) -> TAResult<()> {
    let plan = copy_everything_plan(project_id, true).await?;
    copy_project(app.inner().clone(), DtProjectRef::Id(project_id), plan).await?;
    Ok(())
}
