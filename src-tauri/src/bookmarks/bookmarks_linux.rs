use tauri::command;
use tauri_plugin_dialog::DialogExt;
use super::{PickFolderResult, ResolveResult};

#[command]
pub async fn pick_folder(
    app: tauri::AppHandle,
    _default_path: Option<String>,
    _button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    let folder = app.dialog().file().pick_folder();
    
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
