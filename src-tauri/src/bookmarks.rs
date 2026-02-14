use tauri::command;

#[cfg(target_os = "macos")]
mod ffi {
    use std::os::raw::c_char;

    extern "C" {
        pub fn open_dt_folder_picker(default_path: *const c_char, button_text: *const c_char) -> *mut c_char;
        pub fn free_string_ptr(ptr: *mut c_char);
        pub fn start_accessing_security_scoped_resource(bookmark: *const c_char) -> *mut c_char;
        pub fn stop_all_security_scoped_resources();
        pub fn stop_accessing_security_scoped_resource(bookmark: *const c_char);
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PickFolderResult {
    pub path: String,
    pub bookmark: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ResolveResult {
    CannotResolve,
    Resolved(String),
    StaleRefreshed {
        new_bookmark: String,
        resolved_path: String,
    },
}

#[derive(serde::Deserialize)]
struct FfiResolveResult {
    status: String,
    path: String,
    new_bookmark: Option<String>,
}

#[command]
pub async fn pick_folder(
    app: tauri::AppHandle,
    default_path: Option<String>,
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};
                use tauri::Manager;

        let target_path = match default_path {
            Some(p) => p,
            None => {
                // Default to home directory
                match app.path().home_dir() {
                    Ok(path) => path.to_string_lossy().into_owned(),
                    Err(_) => return Err("Failed to get home directory".to_string()),
                }
            }
        };

        let c_default_path = CString::new(target_path).map_err(|e| e.to_string())?;
        
        let display_button_text = button_text.unwrap_or_else(|| "Select folder".to_string());
        let c_button_text = CString::new(display_button_text).map_err(|e| e.to_string())?;

        let ptr = unsafe { ffi::open_dt_folder_picker(c_default_path.as_ptr(), c_button_text.as_ptr()) };

        if ptr.is_null() {
            return Ok(None);
        }

        let c_str = unsafe { CStr::from_ptr(ptr) };
        let json_result = c_str.to_string_lossy().into_owned();

        unsafe { ffi::free_string_ptr(ptr) };

        // Parse JSON result
        let result: PickFolderResult = serde_json::from_str(&json_result)
            .map_err(|e| format!("Failed to parse picker result: {}", e))?;

        Ok(Some(result))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[command]
pub async fn resolve_bookmark(bookmark: String) -> Result<ResolveResult, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};

        let c_bookmark = CString::new(bookmark).map_err(|e| e.to_string())?;

        let ptr = unsafe { ffi::start_accessing_security_scoped_resource(c_bookmark.as_ptr()) };

        if ptr.is_null() {
            return Ok(ResolveResult::CannotResolve);
        }

        let c_str = unsafe { CStr::from_ptr(ptr) };
        let json_result = c_str.to_string_lossy().into_owned();

        unsafe { ffi::free_string_ptr(ptr) };

        // Parse JSON result from FFI
        let ffi_result: FfiResolveResult = serde_json::from_str(&json_result)
            .map_err(|e| format!("Failed to parse resolve result: {}", e))?;

        match ffi_result.status.as_str() {
            "resolved" => Ok(ResolveResult::Resolved(ffi_result.path)),
            "stale_refreshed" => {
                if let Some(new_bookmark) = ffi_result.new_bookmark {
                    Ok(ResolveResult::StaleRefreshed {
                        new_bookmark,
                        resolved_path: ffi_result.path,
                    })
                } else {
                    // Should not happen if status is stale_refreshed
                    Ok(ResolveResult::Resolved(ffi_result.path))
                }
            }
            _ => Ok(ResolveResult::CannotResolve),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[command]
pub async fn stop_accessing_bookmark(bookmark: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;

        let c_bookmark = CString::new(bookmark).map_err(|e| e.to_string())?;

        unsafe {
            ffi::stop_accessing_security_scoped_resource(c_bookmark.as_ptr());
        };

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Unsupported platform".to_string())
    }
}

pub fn cleanup_bookmarks() {
    #[cfg(target_os = "macos")]
    unsafe {
        ffi::stop_all_security_scoped_resources();
    }
}
