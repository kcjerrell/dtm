use entity::watch_folders;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolderDTO {
    pub id: i64,
    pub path: String,
    pub recursive: Option<bool>,
    pub is_missing: bool,
    pub is_locked: bool,
    pub bookmark: String,
}

impl From<watch_folders::Model> for WatchFolderDTO {
    fn from(m: watch_folders::Model) -> Self {
        Self {
            id: m.id,
            path: m.path,
            recursive: m.recursive,
            is_missing: m.is_missing,
            is_locked: m.is_locked,
            bookmark: m.bookmark,
        }
    }
}
