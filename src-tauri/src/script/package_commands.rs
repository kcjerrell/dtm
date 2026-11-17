use tauri::{ipc::Channel, State};

use super::{
    commands::command_error,
    package_declarations::PackageDeclarations,
    packages::{
        ExpectedPackageState, ScriptDependencies, ScriptDependencyStatus, ScriptLifecycleApproval,
    },
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
pub async fn get_script_dependency_declarations(
    store: State<'_, std::sync::Arc<super::project_store::ProjectStore>>,
    project_id: ProjectId,
    expected_package_revision: String,
) -> Result<PackageDeclarations, String> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        super::package_declarations::installed_declarations(
            &store,
            &project_id,
            &expected_package_revision,
        )
    })
    .await
    .map_err(|error| format!("script package declaration worker failed: {error}"))?
    .map_err(command_error)
}

#[tauri::command]
pub async fn set_script_dependencies(
    service: State<'_, ImageScriptService>,
    project_id: ProjectId,
    operation_id: String,
    dependencies: ScriptDependencies,
    expected_package_state: Option<ExpectedPackageState>,
    progress: Channel<PackageProgress>,
) -> Result<ScriptDependencyStatus, String> {
    service
        .change_dependencies(
            project_id,
            operation_id,
            PackageOperation::Set(dependencies),
            expected_package_state,
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
    expected_package_state: Option<ExpectedPackageState>,
    progress: Channel<PackageProgress>,
) -> Result<ScriptDependencyStatus, String> {
    service
        .change_dependencies(
            project_id,
            operation_id,
            PackageOperation::Restore(lifecycle_approval),
            expected_package_state,
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
