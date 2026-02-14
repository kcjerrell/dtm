use sea_orm::FromQueryResult;
use serde::Serialize;

#[derive(Debug, FromQueryResult)]
pub struct ProjectRow {
    pub id: i64,
    pub fingerprint: String,
    pub path: String,
    pub watchfolder_id: i64,
    pub image_count: Option<i64>,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub missing_on: Option<i64>,
    pub excluded: bool,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ProjectExtra {
    pub id: i64,
    pub fingerprint: String,
    pub path: String,
    pub watchfolder_id: i64,
    pub image_count: Option<i64>,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub missing_on: Option<i64>,
    pub excluded: bool,
    pub name: String,
    pub full_path: String,
    pub is_missing: bool,
}

impl From<ProjectRow> for ProjectExtra {
    fn from(m: ProjectRow) -> Self {
        let name = std::path::Path::new(&m.path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let wf_path = crate::projects_db::folder_cache::get_folder(m.watchfolder_id);

        let full_path = if let Some(ref wf) = wf_path {
            std::path::Path::new(wf)
                .join(&m.path)
                .to_string_lossy()
                .to_string()
        } else {
            m.path.clone()
        };

        let is_missing = m.missing_on.is_some() || wf_path.is_none();

        Self {
            id: m.id,
            fingerprint: m.fingerprint,
            path: m.path,
            watchfolder_id: m.watchfolder_id,
            image_count: m.image_count,
            last_id: m.last_id,
            filesize: m.filesize,
            modified: m.modified,
            missing_on: m.missing_on,
            excluded: m.excluded,
            name,
            full_path,
            is_missing,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct DTProjectInfo {
    pub _path: String,
    pub _history_count: i64,
    pub history_max_id: i64,
}