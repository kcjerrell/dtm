use crate::dtp_service::AppHandleWrapper;
use anyhow::{bail, Context, Result};

use super::{PickFolderResult, ResolveResult};
use tauri::{command, State};

mod ffi {
    use std::os::raw::c_char;

    extern "C" {
        pub fn open_dt_folder_picker(
            default_path: *const c_char,
            button_text: *const c_char,
        ) -> *mut c_char;
        pub fn free_string_ptr(ptr: *mut c_char);
        pub fn start_accessing_security_scoped_resource(bookmark: *const c_char) -> *mut c_char;
        pub fn stop_all_security_scoped_resources();
        pub fn stop_accessing_security_scoped_resource(bookmark: *const c_char);
    }
}

#[derive(serde::Deserialize)]
struct FfiResolveResult {
    status: String,
    path: String,
    new_bookmark: Option<String>,
}

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
    button_text: Option<String>,
) -> Result<Option<PickFolderResult>> {
    use std::ffi::{CStr, CString};

    let target_path = match default_path {
        Some(p) => p,
        None => app
            .get_home_dir()
            .map_err(|_| anyhow::anyhow!("Failed to get home directory"))?
            .to_string_lossy()
            .into_owned(),
    };

    let c_default_path = CString::new(target_path).context("Failed to create CString for path")?;

    let display_button_text = button_text.unwrap_or_else(|| "Select folder".to_string());
    let c_button_text =
        CString::new(display_button_text).context("Failed to create CString for button text")?;

    let ptr =
        unsafe { ffi::open_dt_folder_picker(c_default_path.as_ptr(), c_button_text.as_ptr()) };

    if ptr.is_null() {
        return Ok(None);
    }

    let c_str = unsafe { CStr::from_ptr(ptr) };
    let json_result = c_str.to_string_lossy().into_owned();

    unsafe { ffi::free_string_ptr(ptr) };

    // Parse JSON result
    let result: PickFolderResult =
        serde_json::from_str(&json_result).context("Failed to parse picker result")?;

    Ok(Some(result))
}

#[command]
pub async fn resolve_bookmark(bookmark: String) -> crate::TAResult<ResolveResult> {
    Ok(resolve_bookmark_impl(bookmark).await?)
}

pub async fn resolve_bookmark_impl(bookmark: String) -> Result<ResolveResult> {
    use std::ffi::{CStr, CString};

    if bookmark.starts_with("TESTBOOKMARK::") {
        return Ok(ResolveResult::Resolved(
            bookmark.split("::").last().unwrap().to_string(),
        ));
    }

    let c_bookmark = CString::new(bookmark).context("Failed to create CString for bookmark")?;

    let ptr = unsafe { ffi::start_accessing_security_scoped_resource(c_bookmark.as_ptr()) };

    if ptr.is_null() {
        return Ok(ResolveResult::CannotResolve);
    }

    let c_str = unsafe { CStr::from_ptr(ptr) };
    let json_result = c_str.to_string_lossy().into_owned();

    unsafe { ffi::free_string_ptr(ptr) };

    // Parse JSON result from FFI
    let ffi_result: FfiResolveResult =
        serde_json::from_str(&json_result).context("Failed to parse resolve result")?;

    match ffi_result.status.as_str() {
        "resolved" => {
            log::debug!("Resolved bookmark: {}", ffi_result.path);
            Ok(ResolveResult::Resolved(ffi_result.path))
        }
        "stale_refreshed" => {
            if let Some(new_bookmark) = ffi_result.new_bookmark {
                log::debug!("Stale refreshed bookmark: {}", ffi_result.path);
                Ok(ResolveResult::StaleRefreshed {
                    new_bookmark,
                    resolved_path: ffi_result.path,
                })
            } else {
                // Should not happen if status is stale_refreshed
                log::debug!(
                    "Stale refreshed bookmark with no new bookmark: {}",
                    ffi_result.path
                );
                Ok(ResolveResult::Resolved(ffi_result.path))
            }
        }
        _ => {
            log::debug!("Cannot resolve bookmark: {}", ffi_result.path);
            Ok(ResolveResult::CannotResolve)
        }
    }
}

#[command]
pub async fn stop_accessing_bookmark(bookmark: String) -> crate::TAResult<()> {
    use std::ffi::CString;

    let c_bookmark = CString::new(bookmark).context("Failed to create CString for bookmark")?;

    unsafe {
        ffi::stop_accessing_security_scoped_resource(c_bookmark.as_ptr());
    };

    Ok(())
}

pub fn cleanup_bookmarks() {
    unsafe {
        ffi::stop_all_security_scoped_resources();
    }
}
