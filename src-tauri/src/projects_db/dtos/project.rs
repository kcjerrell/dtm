use sea_orm::FromQueryResult;
use serde::Serialize;

#[derive(Debug, FromQueryResult, Serialize, Clone)]
pub struct ProjectExtra {
    pub id: i64,
    pub fingerprint: String,
    pub path: String,
    pub watchfolder_id: i64,
    pub image_count: Option<i64>,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub excluded: bool,
    pub name: String,
    pub full_path: String,
    pub is_missing: bool,
    pub is_locked: bool,
}

impl ProjectExtra {
    pub fn populate(&mut self) {
        self.name = std::path::Path::new(&self.path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let wf_path = crate::projects_db::folder_cache::get_folder(self.watchfolder_id);

        self.full_path = if let Some(ref wf) = wf_path {
            std::path::Path::new(wf)
                .join(&self.path)
                .to_string_lossy()
                .to_string()
        } else {
            self.path.clone()
        };
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct DTProjectInfo {
    pub _path: String,
    pub _history_count: i64,
    pub history_max_id: i64,
}
