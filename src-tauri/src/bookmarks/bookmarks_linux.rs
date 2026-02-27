use std::str::FromStr;

use crate::dtp_service::AppHandleWrapper;

use super::{PickFolderResult, ResolveResult};
use tauri::{command, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[command]
pub async fn pick_folder_command(
    app: State<'_, AppHandleWrapper>,
    default_path: Option<String>,
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    pick_folder(&app, default_path, button_text).await
}

pub async fn pick_folder(
    app: &AppHandleWrapper,
    default_path: Option<String>,
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    let app = app.app_handle.clone().unwrap();
    let folder_override = match default_path {
        Some(path) => match path.starts_with("TESTPATH::") {
            true => {
                let path = path.strip_prefix("TESTPATH::").unwrap();
                Some(tauri_plugin_fs::FilePath::from_str(path).unwrap())
            }
            false => None,
        },
        None => None,
    };

    let folder: Option<tauri_plugin_fs::FilePath> = match folder_override {
        Some(path) => Some(path),
        None => app.dialog().file().blocking_pick_folder(),
    };

    match folder {
        Some(path) => {
            let path_str = path.to_string();
            Ok(Some(PickFolderResult {
                path: path_str.clone(),
                bookmark: path_str,
            }))
        }
        None => Ok(None),
    }
}

#[command]
pub async fn resolve_bookmark(bookmark: String) -> Result<ResolveResult, String> {
    if bookmark.starts_with("TESTBOOKMARK::") {
        return Ok(ResolveResult::Resolved(
            bookmark.split("::").last().unwrap().to_string(),
        ));
    }

    // On Linux, the bookmark IS the path
    Ok(ResolveResult::Resolved(bookmark))
}

#[command]
pub async fn stop_accessing_bookmark(_bookmark: String) -> Result<(), String> {
    // No-op on Linux
    Ok(())
}

pub fn cleanup_bookmarks() {
    // No-op on Linux
}
