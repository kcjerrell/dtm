use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tempfile::tempdir_in;
use walkdir::WalkDir;

use crate::projects_db::dtos::model::ModelType;

#[derive(Debug, Clone)]
pub struct ProjectFile {
    pub path: String,
    pub filesize: u64,
    pub modified: i64,
    pub _watchfolder_id: i64,
    pub has_base: bool,
    pub is_archive: bool,
}

pub struct GetFolderFilesResult {
    pub projects: HashMap<String, ProjectFile>,
    pub model_info: Vec<(String, ModelType)>,
}

/// Inspect the same base + WAL pair for every SQLite synchronization entry point.
/// Only NotFound means absence; permission and I/O failures remain errors.
pub fn inspect_project_file(
    full_path: &std::path::Path,
    folder: &str,
    folder_id: i64,
) -> anyhow::Result<Option<ProjectFile>> {
    use anyhow::Context;
    let read = |path: &std::path::Path| -> anyhow::Result<Option<fs::Metadata>> {
        match fs::metadata(path) {
            Ok(metadata) => Ok(Some(metadata)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => {
                Err(error).with_context(|| format!("failed to inspect {}", path.display()))
            }
        }
    };
    let Some(base) = read(full_path)? else {
        return Ok(None);
    };
    anyhow::ensure!(
        base.is_file(),
        "project is not a file: {}",
        full_path.display()
    );
    let is_archive = full_path.to_string_lossy().ends_with(".dtm.zip");
    let mut size = base.len();
    let mut modified = base.modified().with_context(|| {
        format!(
            "failed to read modification time for {}",
            full_path.display()
        )
    })?;
    if !is_archive {
        let mut wal = full_path.as_os_str().to_os_string();
        wal.push("-wal");
        if let Some(wal) = read(std::path::Path::new(&wal))? {
            size += wal.len();
            modified = modified.max(
                wal.modified()
                    .context("failed to read WAL modification time")?,
            );
        }
        // The base can disappear while a checkpoint/removal is in flight.
        if read(full_path)?.is_none() {
            return Ok(None);
        }
    }
    Ok(Some(ProjectFile {
        path: full_path
            .strip_prefix(folder)
            .with_context(|| format!("{} is outside watch folder {folder}", full_path.display()))?
            .to_string_lossy()
            .into_owned(),
        filesize: size,
        // Existing SQLite stamps are seconds for compatibility. DTZip support is new, so use
        // microseconds to reliably detect a same-size replacement made within the same second.
        modified: if is_archive {
            system_time_to_epoch_micros(modified)
        } else {
            system_time_to_epoch_secs(modified)
        }
        .context("project modification time predates Unix epoch")?,
        _watchfolder_id: folder_id,
        has_base: true,
        is_archive,
    }))
}

pub async fn get_folder_files(
    watchfolder_path: &str,
    watchfolder_id: i64,
    recursive: bool,
) -> anyhow::Result<GetFolderFilesResult> {
    let folder = watchfolder_path.to_owned();
    tokio::task::spawn_blocking(move || discover_folder(&folder, watchfolder_id, recursive)).await?
}

fn discover_folder(
    folder: &str,
    folder_id: i64,
    recursive: bool,
) -> anyhow::Result<GetFolderFilesResult> {
    use anyhow::Context;
    let mut projects = HashMap::new();
    let mut model_info = Vec::new();
    let walker = WalkDir::new(folder)
        .follow_links(false)
        .max_depth(if recursive { usize::MAX } else { 1 });
    // A partial listing is never evidence of deletion. Fail before returning a
    // diff so the previous index survives and a later check can retry.
    for entry in walker {
        let entry = entry.with_context(|| format!("failed to enumerate watch folder {folder}"))?;
        if entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        match path.extension().and_then(|s| s.to_str()) {
            Some("sqlite3") | Some("sqlite3-wal") => {
                let base = path.with_extension("sqlite3");
                let key = base.to_string_lossy().into_owned();
                if !projects.contains_key(&key) {
                    if let Some(file) = inspect_project_file(&base, folder, folder_id)? {
                        projects.insert(key, file);
                    }
                }
            }
            Some("json") => {
                if let Some(kind) = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .and_then(get_model_file_type)
                {
                    model_info.push((path.to_string_lossy().into_owned(), kind));
                }
            }
            Some("zip") if path.to_string_lossy().ends_with(".dtm.zip") => {
                if let Some(file) = inspect_project_file(path, folder, folder_id)? {
                    projects.insert(path.to_string_lossy().into_owned(), file);
                }
            }
            _ => {}
        }
    }
    Ok(GetFolderFilesResult {
        projects,
        model_info,
    })
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

fn system_time_to_epoch_micros(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_micros()).ok())
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

    /// creates a temporary subfolder in the app's temp folder
    pub fn create_temp_dir(&self) -> tauri::Result<PathBuf> {
        if let Some(_app_handle) = &self.app_handle {
            let temp = self.get_temp_dir()?;
            let temp_dir = tempdir_in(temp)?;
            Ok(temp_dir.keep())
        } else {
            Ok(self.get_test_path("temp_dir"))
        }
    }

    /// gets the app's temp folder
    pub fn get_temp_dir(&self) -> tauri::Result<PathBuf> {
        let temp = self.temp_dir_path()?;
        fs::create_dir_all(&temp)?;
        Ok(temp)
    }

    /// removes the app's temp folder and all of its contents
    pub fn clear_temp_dir(&self) -> tauri::Result<()> {
        remove_dir_if_exists(&self.temp_dir_path()?)?;
        Ok(())
    }

    fn temp_dir_path(&self) -> tauri::Result<PathBuf> {
        if let Some(app_handle) = &self.app_handle {
            Ok(app_handle.path().app_data_dir()?.join("temp"))
        } else {
            Ok(std::env::current_dir()?.join("test_data/temp/temp_dir"))
        }
    }
}

fn remove_dir_if_exists(path: &Path) -> std::io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
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

#[cfg(test)]
mod synchronization_tests {
    use super::*;

    #[test]
    fn temp_dir_cleanup_removes_contents_and_is_idempotent() {
        let parent = tempfile::tempdir().unwrap();
        let temp = parent.path().join("temp");
        fs::create_dir_all(temp.join("nested")).unwrap();
        fs::write(temp.join("nested/file"), "temporary data").unwrap();

        remove_dir_if_exists(&temp).unwrap();
        assert!(!temp.exists());

        remove_dir_if_exists(&temp).unwrap();
    }

    #[tokio::test]
    async fn sqlite_metadata_matches_discovery_with_and_without_wal() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_str().unwrap();
        let base = dir.path().join("project.sqlite3");
        let wal = dir.path().join("project.sqlite3-wal");
        fs::write(&base, [1; 20]).unwrap();
        for size in [0, 30, 10, 0] {
            if size == 0 {
                let _ = fs::remove_file(&wal);
            } else {
                fs::write(&wal, vec![2; size]).unwrap();
            }
            let inspected = inspect_project_file(&base, folder, 1).unwrap().unwrap();
            let files = get_folder_files(folder, 1, true).await.unwrap();
            let discovered = &files.projects[base.to_str().unwrap()];
            assert_eq!(inspected.filesize, 20 + size as u64);
            assert_eq!(inspected.filesize, discovered.filesize);
            assert_eq!(inspected.modified, discovered.modified);
        }
        fs::remove_file(&base).unwrap();
        fs::write(&wal, [0; 10]).unwrap();
        assert!(inspect_project_file(&base, folder, 1).unwrap().is_none());
        assert!(get_folder_files(folder, 1, true)
            .await
            .unwrap()
            .projects
            .is_empty());
    }

    #[tokio::test]
    async fn archive_discovery_persists_real_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_str().unwrap();
        let archive = dir.path().join("project.dtm.zip");
        fs::write(&archive, [7; 37]).unwrap();
        fs::write(dir.path().join("unrelated.zip"), [8; 12]).unwrap();

        let inspected = inspect_project_file(&archive, folder, 4).unwrap().unwrap();
        let discovered = get_folder_files(folder, 4, true).await.unwrap();
        let project = &discovered.projects[archive.to_str().unwrap()];
        assert_eq!(project.filesize, 37);
        assert_eq!(project.modified, inspected.modified);
        assert!(project.has_base);
        assert!(project.is_archive);
        assert_eq!(project.path, "project.dtm.zip");
        assert_eq!(discovered.projects.len(), 1);
    }
    #[tokio::test]
    #[cfg(unix)]
    async fn failed_inspection_is_not_an_empty_discovery_and_recursion_is_respected() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_str().unwrap();
        fs::create_dir(dir.path().join("nested")).unwrap();
        fs::write(dir.path().join("nested/project.sqlite3"), [0; 10]).unwrap();
        assert!(get_folder_files(folder, 1, false)
            .await
            .unwrap()
            .projects
            .is_empty());
        assert_eq!(
            get_folder_files(folder, 1, true)
                .await
                .unwrap()
                .projects
                .len(),
            1
        );
        let loop_path = dir.path().join("loop.sqlite3");
        std::os::unix::fs::symlink(&loop_path, &loop_path).unwrap();
        assert!(inspect_project_file(&loop_path, folder, 1).is_err());
        assert!(get_folder_files(folder, 1, true).await.is_err());
    }
}
