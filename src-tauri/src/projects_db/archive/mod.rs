use tauri::State;

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        archive::{copy::copy_project, plan::create_plan},
        DtProjectRef,
    },
    TAResult,
};

mod copy;
pub(crate) mod workers;
pub(crate) mod cache;
pub(crate) mod dt_zip;
pub mod plan;

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<()> {
    let plan = create_plan(&dtp, project_id, true).await?;
    copy_project(
        app.inner().clone(),
        DtProjectRef::Id(project_id),
        plan,
    )
    .await?;
    Ok(())
}
