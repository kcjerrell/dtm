use tauri::command;

#[cfg(target_os = "macos")]
mod ffi {
    use std::os::raw::c_char;

    extern "C" {
        pub fn open_dt_folder_picker(default_path: *const c_char) -> *mut c_char;
        pub fn free_string_ptr(ptr: *mut c_char);
        pub fn start_accessing_security_scoped_resource(bookmark: *const c_char) -> *mut c_char;
        pub fn stop_all_security_scoped_resources();
        pub fn stop_accessing_security_scoped_resource(bookmark: *const c_char);
    }
}

#[derive(serde::Serialize)]
pub struct PickFolderResult {
    pub path: String,
    pub bookmark: String,
}

#[command]
pub async fn pick_draw_things_folder(
    default_path: Option<String>,
) -> Result<Option<PickFolderResult>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};
        use std::ptr;

        // This function must run on the main thread for UI
        // In Tauri v2, commands are async by default on a thread pool.
        // NSOpenPanel should ideally be run on main thread.
        // However, let's try calling it directly first. If it crashes/hangs, we'll need dispatch.

        let c_default_path = match default_path {
            Some(path) => Some(CString::new(path).map_err(|e| e.to_string())?),
            None => None,
        };

        let ptr_arg = match &c_default_path {
            Some(c_str) => c_str.as_ptr(),
            None => ptr::null(),
        };

        let ptr = unsafe { ffi::open_dt_folder_picker(ptr_arg) };

        if ptr.is_null() {
            return Ok(None);
        }

        let c_str = unsafe { CStr::from_ptr(ptr) };
        let full_result = c_str.to_string_lossy().into_owned();

        unsafe { ffi::free_string_ptr(ptr) };

        // Parse "path|bookmark"
        if let Some((path, bookmark)) = full_result.split_once('|') {
            Ok(Some(PickFolderResult {
                path: path.to_string(),
                bookmark: bookmark.to_string(),
            }))
        } else {
            Err("Failed to parse picker result".to_string())
        }
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
