//! Run and trust commands for the application-owned script service.
use super::{service::ImageScriptService, types::*};
use tauri::State;
type CommandResult<T> = Result<T, String>;
pub(super) fn command_error(error: anyhow::Error) -> String {
    format!("{error:#}")
}

#[tauri::command]
pub async fn run_script(
    service: State<'_, ImageScriptService>,
    request: RunRequest,
) -> CommandResult<RunIdentity> {
    service.run(request).await.map_err(command_error)
}
#[tauri::command]
pub fn cancel_script(service: State<'_, ImageScriptService>) -> CommandResult<()> {
    service.cancel().map_err(command_error)
}
#[tauri::command]
pub async fn trust_script_project(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    expected_source: String,
) -> CommandResult<()> {
    service
        .trust_project(project_id, expected_source)
        .await
        .map_err(command_error)
}
#[tauri::command]
pub fn revoke_script_project_trust(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
) -> CommandResult<()> {
    service.revoke_trust(&project_id).map_err(command_error)
}
/// Preserve session-local approval when saving trusted source through the editor.
#[tauri::command]
pub async fn save_trusted_script_project(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    source: String,
    source_revision: SourceRevision,
) -> CommandResult<SourceRevision> {
    service
        .save_project(project_id, source, source_revision)
        .await
        .map_err(command_error)
}
