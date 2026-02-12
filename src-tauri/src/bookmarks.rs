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

#[command]
pub async fn pick_folder(
    app: tauri::AppHandle,
    default_path: Option<String>,
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};
        use std::ptr;
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
pub async fn resolve_bookmark(bookmark: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};

        let c_bookmark = CString::new(bookmark).map_err(|e| e.to_string())?;

        let ptr = unsafe { ffi::start_accessing_security_scoped_resource(c_bookmark.as_ptr()) };

        if ptr.is_null() {
            return Err("Failed to resolve bookmark or start accessing resource".to_string());
        }

        let c_str = unsafe { CStr::from_ptr(ptr) };
        let result = c_str.to_string_lossy().into_owned();

        unsafe { ffi::free_string_ptr(ptr) };

        Ok(result)
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
