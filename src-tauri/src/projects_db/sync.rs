use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

use dtm_macros::dtm_command;
use entity::enums::ModelType;
use tauri::AppHandle;

use crate::projects_db::{
    dtos::{project::ProjectExtra, watch_folder::WatchFolderDTO},
    folder_cache, ProjectsDb,
};

#[derive(Debug)]
struct ProjectFile {
    path: String,
    filesize: u64,
    modified: i64,
    watchfolder_id: i64,
    has_base: bool,
}

#[derive(Default, Debug, PartialEq, Eq)]
enum SyncAction {
    #[default]
    None = 0,
    Add,
    Remove,
    Update,
}

#[derive(Default, Debug)]
struct ProjectSync {
    entity: Option<ProjectExtra>,
    file: Option<ProjectFile>,
    action: SyncAction,
}

#[dtm_command]
pub async fn sync(app: AppHandle) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app).await?;

    let folders = pdb.list_watch_folders().await.unwrap();

    for folder in folders {
        sync_folder(&app, &folder).await?;
    }

    Ok(())
}

async fn sync_folder(app: &AppHandle, folder: &WatchFolderDTO) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(app).await?;
    let files = get_folder_files(folder).await;
    let mut project_files = files.projects;
    let mut sync_projects: Vec<ProjectSync> = Vec::new();
    let entities = pdb.list_projects(Some(folder.id)).await.unwrap();

    for entity in entities {
        let full_path = get_full_project_path(&entity);
        let file = project_files.remove(&full_path);

        let sync = ProjectSync {
            entity: Some(entity),
            file,
            action: SyncAction::None,
        };
        sync_projects.push(sync);
    }

    for (_key, file) in project_files.drain() {
        let sync = ProjectSync {
            entity: None,
            file: Some(file),
            action: SyncAction::Remove,
        };
        sync_projects.push(sync);
    }

    for sync in sync_projects.iter_mut() {
        assign_sync_action(sync);
        println!("sync: {:#?}", sync);
        match sync.action {
            SyncAction::Add => {
                pdb.add_project(folder.id, &sync.file.as_ref().unwrap().path)
                    .await
                    .map_err(|e| e.to_string())?;
                pdb.scan_project(sync.entity.as_ref().unwrap().id, true)
                    .await
                    .map_err(|e| e.to_string())?;
                pdb.update_project(
                    sync.entity.as_ref().unwrap().id,
                    Some(sync.file.as_ref().unwrap().filesize as i64),
                    Some(sync.file.as_ref().unwrap().modified),
                )
                .await
                .map_err(|e| e.to_string())?;
            }
            SyncAction::Remove => {
                pdb.remove_project(sync.entity.as_ref().unwrap().id)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            SyncAction::Update => {
                pdb.scan_project(sync.entity.as_ref().unwrap().id, false)
                    .await
                    .map_err(|e| e.to_string())?;
                pdb.update_project(
                    sync.entity.as_ref().unwrap().id,
                    Some(sync.file.as_ref().unwrap().filesize as i64),
                    Some(sync.file.as_ref().unwrap().modified),
                )
                .await
                .map_err(|e| e.to_string())?;
            }
            SyncAction::None => {}
        }
    }
    Ok(())
}
// match file {
//     Some(file) => {
//         if file.filesize != entity.filesize.unwrap_or(0) as u64 || file.modified != entity.modified.unwrap_or(0) as i64 {
//             pdb.update_project(entity.id, Some(file.filesize as i64), Some(file.modified))
//                 .await
//                 .map_err(|e| e.to_string())?;
//         }
//     }
//     None => {
//         pdb.remove_project(entity.id)
//             .await
//             .map_err(|e| e.to_string())?;
//     }
// }

fn assign_sync_action(sync: &mut ProjectSync) {
    if sync.entity.is_none() && sync.file.is_some() {
        sync.action = SyncAction::Add;
        return;
    }
    if sync.entity.is_some() && sync.file.is_none() {
        sync.action = SyncAction::Remove;
        return;
    }
    if sync.entity.is_none() && sync.file.is_none() {
        return;
    }
    if let (Some(entity), Some(file)) = (sync.entity.as_ref(), sync.file.as_ref()) {
        if file.filesize != entity.filesize.unwrap_or(0) as u64
            || file.modified != entity.modified.unwrap_or(0) as i64
        {
            sync.action = SyncAction::Update;
        }
    }
}

struct GetFolderFilesResult {
    projects: HashMap<String, ProjectFile>,
    model_info: Vec<(String, ModelType)>,
}

async fn get_folder_files(watchfolder: &WatchFolderDTO) -> GetFolderFilesResult {
    let mut projects: HashMap<String, ProjectFile> = HashMap::new();
    let mut model_info: Vec<(String, ModelType)> = Vec::new();

    // Walk the folder recursively
    for entry in WalkDir::new(&watchfolder.path)
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
                    get_project_path(path.to_string_lossy().to_string(), watchfolder);
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
                        watchfolder_id: watchfolder.id,
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

    GetFolderFilesResult {
        projects,
        model_info,
    }
}

fn get_project_path(full_path: String, watchfolder: &WatchFolderDTO) -> String {
    let path = PathBuf::from(full_path);
    path.strip_prefix(&watchfolder.path)
        .expect("path should be in watchfolder")
        .with_extension("sqlite3")
        .to_string_lossy()
        .to_string()
}

fn get_full_project_path(project: &ProjectExtra) -> String {
    let folder = folder_cache::get_folder(project.watchfolder_id).unwrap();
    let path = PathBuf::from(folder)
        .join(project.path.to_string())
        .with_extension("sqlite3");
    path.to_string_lossy().to_string()
}

fn get_model_file_type(filename: &str) -> Option<ModelType> {
    match filename {
        "custom.json" | "uncurated_models.json" | "models.json" => Some(ModelType::Model),
        "custom_controlnet.json" | "controlnets.json" => Some(ModelType::Cnet),
        "custom_lora.json" | "loras.json" => Some(ModelType::Lora),
        _ => None,
    }
}

fn system_time_to_epoch_secs(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}
