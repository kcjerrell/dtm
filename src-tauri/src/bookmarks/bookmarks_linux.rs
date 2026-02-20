use tauri::command;
use tauri_plugin_dialog::DialogExt;
use super::{PickFolderResult, ResolveResult};

#[command]
pub async fn pick_folder(
    app: tauri::AppHandle,
    default_path: Option<String>,
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {

    let folder_override = match default_path {
        Some(path) => {
            match path.starts_with("TESTPATH::") {
                true => {
                    let path = path.strip_prefix("TESTPATH::").unwrap();
                    Some(tauri_plugin_fs::FilePath::from(path.to_string()))
                }
                false => None,
            }
        }
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
