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

pub use commands::{clear_dt_archive_plan_cache, create_dt_archive_plan};

pub use cache::DTZipCache;
pub use dt_zip::DTZip;
pub use plan::{
    CreateDtArchiveOptions, DtArchivePlan, DtArchivePlanItem, DtArchivePreview, Format, PngEffort,
    TensorCounts,
};

use plan::copy_everything_plan;

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    opts: CreateDtArchiveOptions,
) -> TAResult<()> {
    if opts.target.trim().is_empty() {
        return Err(anyhow::anyhow!("archive output folder is required").into());
    }

    let project_id = opts.project_id;
    let plan = copy_everything_plan(project_id).await?;
    copy_project(
        app.inner().clone(),
        DtProjectRef::Id(project_id),
        plan,
        opts,
    )
    .await?;
    Ok(())
}
