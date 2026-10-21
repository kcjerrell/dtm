//! Command surface only; registration and frontend event delivery belong to S40.
use super::{service::ImageScriptService, types::*};
use tauri::State;
type CommandResult<T> = Result<T, String>;
fn command_error(error: anyhow::Error) -> String {
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
) -> CommandResult<()> {
    service
        .trust_project(project_id)
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
/// S40 must route editor saves through this command to preserve trust safely.
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
