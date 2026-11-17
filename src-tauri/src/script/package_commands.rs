use tauri::{ipc::Channel, State};

use super::{
    commands::command_error,
    packages::{ScriptDependencies, ScriptDependencyStatus, ScriptLifecycleApproval},
    service::{ImageScriptService, PackageOperation, PackageProgress},
    types::ProjectId,
};

#[tauri::command]
pub async fn get_script_dependencies(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
) -> Result<ScriptDependencyStatus, String> {
    service
        .dependency_status(project_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn set_script_dependencies(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    operation_id: String,
    dependencies: ScriptDependencies,
    progress: Channel<PackageProgress>,
) -> Result<ScriptDependencyStatus, String> {
    service
        .change_dependencies(
            project_id,
            operation_id,
            PackageOperation::Set(dependencies),
            move |event| {
                let _ = progress.send(event);
            },
        )
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn restore_script_dependencies(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    operation_id: String,
    lifecycle_approval: Option<ScriptLifecycleApproval>,
    progress: Channel<PackageProgress>,
) -> Result<ScriptDependencyStatus, String> {
    service
        .change_dependencies(
            project_id,
            operation_id,
            PackageOperation::Restore(lifecycle_approval),
            move |event| {
                let _ = progress.send(event);
            },
        )
        .await
        .map_err(command_error)
}

#[tauri::command]
pub fn cancel_script_dependency_install(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    operation_id: String,
) -> Result<bool, String> {
    service
        .cancel_dependency_install(&project_id, &operation_id)
        .map_err(command_error)
}
