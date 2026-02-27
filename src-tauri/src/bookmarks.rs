#[cfg(target_os = "macos")]
mod bookmarks_mac;
#[cfg(target_os = "macos")]
pub use bookmarks_mac::*;

#[cfg(target_os = "linux")]
mod bookmarks_linux;
#[cfg(target_os = "linux")]
pub use bookmarks_linux::*;

// Also support other non-macos platforms as linux-like (simple paths)
#[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
mod bookmarks_linux;
#[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
pub use bookmarks_linux::*;


#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PickFolderResult {
    pub path: String,
    pub bookmark: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ResolveResult {
    CannotResolve,
    Resolved(String),
    StaleRefreshed {
        new_bookmark: String,
        resolved_path: String,
    },
}
