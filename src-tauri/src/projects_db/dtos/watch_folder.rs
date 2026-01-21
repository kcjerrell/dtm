use entity::watch_folders;
pub use entity::enums::ItemType;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct WatchFolderDTO {
    pub id: i64,
    pub path: String,
    pub recursive: Option<bool>,
    pub item_type: ItemType,
    pub last_updated: Option<i64>,
}

impl From<watch_folders::Model> for WatchFolderDTO {
    fn from(m: watch_folders::Model) -> Self {
        Self {
            id: m.id,
            path: m.path,
            recursive: m.recursive,
            item_type: m.item_type,
            last_updated: m.last_updated,
        }
    }
}
