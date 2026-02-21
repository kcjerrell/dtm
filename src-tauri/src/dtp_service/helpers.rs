use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

use crate::projects_db::dtos::model::ModelType;
use crate::projects_db::dtos::project::ProjectExtra;
use crate::projects_db::folder_cache;

#[derive(Debug, Clone)]
pub struct ProjectFile {
    pub path: String,
    pub filesize: u64,
    pub modified: i64,
    pub _watchfolder_id: i64,
    pub has_base: bool,
}

pub struct GetFolderFilesResult {
    pub projects: HashMap<String, ProjectFile>,
    pub model_info: Vec<(String, ModelType)>,
}

pub async fn get_folder_files(watchfolder_path: &str, watchfolder_id: i64) -> GetFolderFilesResult {
    let mut projects: HashMap<String, ProjectFile> = HashMap::new();
    let mut model_info: Vec<(String, ModelType)> = Vec::new();

    // Walk the folder recursively
    for entry in WalkDir::new(watchfolder_path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        // Safe extension check
        let ext = match path.extension().and_then(|s| s.to_str()) {
            Some(e) => e,
            None => continue,
        };

        match ext {
            "sqlite3" | "sqlite3-wal" => {
                let project_path =
                    get_project_path(path.to_string_lossy().to_string(), watchfolder_path);
                let project_path = PathBuf::from(project_path).with_extension("sqlite3"); // normalize

                let key = path
                    .parent()
                    .map(|p| {
                        p.join(
                            path.with_extension("sqlite3")
                                .file_name()
                                .unwrap_or_default(),
                        )
                    })
                    .unwrap_or_else(|| path.to_path_buf())
                    .to_string_lossy()
                    .to_string();

                if let Ok(metadata) = fs::metadata(path) {
                    let project = projects.entry(key.clone()).or_insert_with(|| ProjectFile {
                        path: project_path.to_string_lossy().to_string(),
                        has_base: false,
                        filesize: 0,
                        modified: 0,
                        _watchfolder_id: watchfolder_id,
                    });

                    if ext == "sqlite3" {
                        project.has_base = true;
                    }

                    project.filesize += metadata.len();
                    if let Ok(modified) = metadata.modified() {
                        if let Some(epoch) = system_time_to_epoch_secs(modified) {
                            project.modified = project.modified.max(epoch);
                        }
                    }
                }
            }
            "json" => {
                if let Some(model_type) = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .and_then(get_model_file_type)
                {
                    model_info.push((path.to_string_lossy().to_string(), model_type));
                }
            }
            _ => {}
        }
    }

    projects.retain(|_, v| v.has_base);

    GetFolderFilesResult {
        projects,
        model_info,
    }
}

pub fn get_project_path(full_path: String, watchfolder_path: &str) -> String {
    let path = PathBuf::from(full_path);
    path.strip_prefix(watchfolder_path)
        .expect("path should be in watchfolder")
        .with_extension("sqlite3")
        .to_string_lossy()
        .to_string()
}

pub fn get_full_project_path(project: &ProjectExtra) -> String {
    let folder = folder_cache::get_folder(project.watchfolder_id).unwrap();
    let path = PathBuf::from(folder)
        .join(project.path.to_string())
        .with_extension("sqlite3");
    path.to_string_lossy().to_string()
}

pub fn get_model_file_type(filename: &str) -> Option<ModelType> {
    match filename {
        "custom.json" | "uncurated_models.json" | "models.json" => Some(ModelType::Model),
        "custom_controlnet.json" | "controlnets.json" => Some(ModelType::Cnet),
        "custom_lora.json" | "loras.json" => Some(ModelType::Lora),
        _ => None,
    }
}

pub fn system_time_to_epoch_secs(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

#[derive(Clone)]
pub struct AppHandleWrapper {
    pub app_handle: Option<AppHandle>,
}

impl AppHandleWrapper {
    pub fn new(app_handle: Option<AppHandle>) -> Self {
        Self { app_handle }
    }

    fn get_test_path(&self, path: &str) -> PathBuf {
        let base = std::env::current_dir().unwrap().join("test_data/temp");
        let result = match path {
            "" => base,
            _ => base.join(path),
        };
        fs::create_dir_all(&result).unwrap();
        result
    }

    pub fn get_home_dir(&self) -> tauri::Result<PathBuf> {
        if let Some(app_handle) = &self.app_handle {
            app_handle.path().home_dir()
        } else {
            Ok(self.get_test_path(""))
        }
    }

    pub fn get_app_data_dir(&self) -> tauri::Result<PathBuf> {
        if let Some(app_handle) = &self.app_handle {
            app_handle.path().app_data_dir()
        } else {
            Ok(self.get_test_path("app_data_dir"))
        }
    }
}

impl From<AppHandle> for AppHandleWrapper {
    fn from(value: AppHandle) -> Self {
        Self {
            app_handle: Some(value.clone()),
        }
    }
}

impl From<&AppHandle> for AppHandleWrapper {
    fn from(value: &AppHandle) -> Self {
        Self {
            app_handle: Some(value.clone()),
        }
    }
}
