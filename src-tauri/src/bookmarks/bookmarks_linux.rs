use anyhow::{anyhow, Context, Result};
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
) -> crate::TAResult<Option<PickFolderResult>> {
    Ok(pick_folder(&app, default_path, button_text).await?)
}

pub async fn pick_folder(
    app: &AppHandleWrapper,
    default_path: Option<String>,
    _button_text: Option<String>,
) -> Result<Option<PickFolderResult>> {
    let app = app
        .app_handle
        .clone()
        .ok_or_else(|| anyhow!("application handle is unavailable while picking a folder"))?;
    let folder_override = match default_path {
        Some(path) => match path.starts_with("TESTPATH::") {
            true => Some(
                tauri_plugin_fs::FilePath::from_str(
                    path.strip_prefix("TESTPATH::")
                        .ok_or_else(|| anyhow!("invalid test folder path override"))?,
                )
                .context("invalid test folder path override")?,
            ),
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
pub async fn resolve_bookmark(bookmark: String) -> crate::TAResult<ResolveResult> {
    Ok(resolve_bookmark_impl(bookmark).await?)
}

pub async fn resolve_bookmark_impl(bookmark: String) -> anyhow::Result<ResolveResult> {
    if bookmark.starts_with("TESTBOOKMARK::") {
        let path = bookmark
            .strip_prefix("TESTBOOKMARK::")
            .ok_or_else(|| anyhow!("invalid test bookmark"))?;
        return Ok(ResolveResult::Resolved(path.to_string()));
    }

    // On Linux, the bookmark IS the path
    Ok(ResolveResult::Resolved(bookmark))
}

#[command]
pub async fn stop_accessing_bookmark(_bookmark: String) -> crate::TAResult<()> {
    // No-op on Linux
    Ok(())
}

pub fn cleanup_bookmarks() {
    // No-op on Linux
}
