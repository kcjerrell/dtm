use entity::projects;
use sea_orm::FromQueryResult;
use serde::Serialize;

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ProjectExtra {
    pub id: i64,
    pub fingerprint: String,
    pub path: String,
    pub image_count: Option<i64>,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub missing_on: Option<i64>,
    pub excluded: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DTProjectInfo {
    pub _path: String,
    pub _history_count: i64,
    pub history_max_id: i64,
}

impl From<projects::Model> for ProjectExtra {
    fn from(m: projects::Model) -> Self {
        Self {
            id: m.id,
            fingerprint: m.fingerprint,
            path: m.path,
            image_count: None,
            last_id: None,
            filesize: m.filesize,
            modified: m.modified,
            missing_on: m.missing_on,
            excluded: m.excluded,
        }
    }
}
