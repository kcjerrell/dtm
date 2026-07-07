use std::str::FromStr;

use crate::{dtp_service::AppHandleWrapper, IntoTAResult, TAResult};

use super::{PickFolderResult, ResolveResult};
use tauri::{command, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[command]
pub async fn pick_folder_command(
    app: State<'_, AppHandleWrapper>,
    default_path: Option<String>,
    button_text: Option<String>,
) -> TAResult<Option<PickFolderResult>> {
    pick_folder(&app, default_path, button_text)
        .await
        .into_ta_result()
}

pub async fn pick_folder(
    app: &AppHandleWrapper,
    default_path: Option<String>,
    button_text: Option<String>,
) -> anyhow::Result<Option<PickFolderResult>> {
    let app = app.app_handle.clone().unwrap();
    let folder_override = match default_path {
        Some(path) => match path.starts_with("TESTPATH::") {
            true => {
                let path = path.strip_prefix("TESTPATH::").unwrap();
                Some(tauri_plugin_fs::FilePath::from_str(path).map_err(anyhow::Error::msg)?)
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
pub async fn resolve_bookmark(bookmark: String) -> TAResult<ResolveResult> {
    if bookmark.starts_with("TESTBOOKMARK::") {
        return Ok(ResolveResult::Resolved(
            bookmark.split("::").last().unwrap().to_string(),
        ));
    }

    // On Linux, the bookmark IS the path
    Ok(ResolveResult::Resolved(bookmark))
}

#[command]
pub async fn stop_accessing_bookmark(_bookmark: String) -> TAResult<()> {
    // No-op on Linux
    Ok(())
}

pub fn cleanup_bookmarks() {
    // No-op on Linux
}
