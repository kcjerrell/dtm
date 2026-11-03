use std::sync::Arc;

use tauri::State;

use super::{
    project_store::{ProjectStore, StoredProject},
    types::{ProjectId, ProjectManifest},
};

type CommandResult<T> = Result<T, String>;

fn command_error(error: anyhow::Error) -> String {
    format!("{error:#}")
}

#[tauri::command]
pub fn create_script_project(
    store: State<'_, Arc<ProjectStore>>,
    display_name: String,
) -> CommandResult<StoredProject> {
    store.create(&display_name).map_err(command_error)
}

#[tauri::command]
pub fn list_script_projects(
    store: State<'_, Arc<ProjectStore>>,
) -> CommandResult<Vec<ProjectManifest>> {
    store.list().map_err(command_error)
}

#[tauri::command]
pub fn open_script_project(
    store: State<'_, Arc<ProjectStore>>,
    project_id: ProjectId,
) -> CommandResult<StoredProject> {
    store.open(&project_id).map_err(command_error)
}

#[tauri::command]
pub fn rename_script_project(
    store: State<'_, Arc<ProjectStore>>,
    project_id: ProjectId,
    display_name: String,
) -> CommandResult<ProjectManifest> {
    store
        .rename(&project_id, &display_name)
        .map_err(command_error)
}
