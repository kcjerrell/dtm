use tauri::Emitter;

use crate::projects_db::{
    dt_project::{ProjectRef, TensorHistoryExtra, TensorRaw},
    projects_db::{ImageExtra, Paged, ProjectExtra, ScanProgress},
    tensors::decode_tensor,
    DTProject, ProjectsDb, TensorHistoryImport,
};

#[tauri::command]
pub async fn projects_db_image_count(app_handle: tauri::AppHandle) -> Result<u32, String> {
    let projects_db = ProjectsDb::get_or_init(&app_handle).await?;
    Ok(projects_db.get_image_count().await.unwrap())
}

#[tauri::command]
pub async fn projects_db_project_add(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<ProjectExtra, String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    let project = pdb.add_project(&path).await.unwrap();
    Ok(project)
}

#[tauri::command]
pub async fn projects_db_project_remove(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    pdb.remove_project(&path).await.unwrap();
    Ok(())
}

#[tauri::command]
pub async fn projects_db_project_list(
    app_handle: tauri::AppHandle,
) -> Result<Vec<super::projects_db::ProjectExtra>, String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    let projects = pdb.list_projects().await.unwrap();
    Ok(projects)
}

#[tauri::command]
pub async fn projects_db_project_scan(
    app: tauri::AppHandle,
    path: String,
    full_scan: Option<bool>,
    filesize: Option<i64>,
    modified: Option<i64>,
) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app).await?;
    let update = |images_scanned: i32, images_total: i32| {
        app.emit(
            "projects_db_scan_progress",
            ScanProgress {
                projects_scanned: 0,
                projects_total: 1,
                project_final: -1,
                project_path: path.clone(),
                images_scanned,
                images_total,
            },
        )
        .unwrap();
    };
    match pdb
        .scan_project(&path, update, full_scan.unwrap_or(false))
        .await
    {
        Ok(total) => {
            pdb.update_project(&path, filesize, modified)
                .await
                .map_err(|e| e.to_string())?;
            app.emit(
                "projects_db_scan_progress",
                ScanProgress {
                    projects_scanned: 1,
                    projects_total: 1,
                    project_final: total as i32,
                    project_path: path.clone(),
                    images_scanned: -1,
                    images_total: -1,
                },
            )
            .unwrap();
        }
        Err(err) => {
            eprintln!("Error scanning project {}: {}", path, err);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn projects_db_project_scan_all(app_handle: tauri::AppHandle) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    pdb.scan_all_projects(&app_handle).await?;
    Ok(())
}

#[tauri::command]
pub async fn projects_db_image_list(
    app: tauri::AppHandle,
    project_ids: Option<Vec<i32>>,
    sort: Option<String>,
    direction: Option<String>,
    model: Option<String>,
    prompt_search: Option<String>,
    take: Option<i32>,
    skip: Option<i32>,
) -> Result<Paged<ImageExtra>, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let opts = super::projects_db::ListImagesOptions {
        project_ids,
        sort,
        direction,
        model,
        take,
        skip,
        search: prompt_search,
    };

    Ok(projects_db.list_images(opts).await.unwrap())
}

#[tauri::command]
pub async fn dt_project_get_tensor_history(
    project_file: String,
    index: u32,
    count: u32,
) -> Result<Vec<TensorHistoryImport>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    Ok(project
        .get_tensor_history(index as i64, count as i64)
        .await
        .unwrap())
}

#[tauri::command]
pub async fn dt_project_get_thumb_half(
    project_file: String,
    thumb_id: i64,
) -> Result<Vec<u8>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    Ok(project.get_thumb_half(thumb_id).await.unwrap())
}

#[tauri::command]
pub async fn dt_project_get_history_full(
    project_file: String,
    row_id: i64,
) -> Result<TensorHistoryExtra, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    let history = project.get_history_full(row_id).await.unwrap();
    Ok(history)
}

#[tauri::command]
pub async fn dt_project_get_tensor(
    app: tauri::AppHandle,
    project_id: Option<i64>,
    project_path: Option<String>,
    tensor_id: String,
) -> Result<Vec<u8>, String> {
    let project = get_project(app, project_path, project_id).await.unwrap();
    let buffer = project.get_tensor(&tensor_id).await.unwrap();
    Ok(buffer)
}

#[tauri::command]
pub async fn dt_project_get_tensor_raw(
    app: tauri::AppHandle,
    project_id: Option<i64>,
    project_path: Option<String>,
    tensor_id: String,
) -> Result<TensorRaw, String> {
    let project = get_project(app, project_path, project_id).await.unwrap();
    let tensor = project.get_tensor_raw(&tensor_id).await.unwrap();
    Ok(tensor)
}

#[tauri::command]
pub async fn dt_project_decode_tensor(
    app: tauri::AppHandle,
    project_id: Option<i64>,
    project_path: Option<String>,
    node_id: Option<i64>,
    tensor_id: String,
    as_png: bool,
) -> Result<tauri::ipc::Response, String> {
    let project = get_project(app, project_path, project_id).await.unwrap();
    let tensor = project.get_tensor_raw(&tensor_id).await.unwrap();

    let metadata = match node_id {
        Some(node) => Some(project.get_history_full(node).await.unwrap().history),
        None => None,
    };

    let buffer = decode_tensor(tensor, as_png, metadata).unwrap();
    Ok(tauri::ipc::Response::new(buffer))
}

#[tauri::command]
pub async fn dt_project_find_predecessor_candidates(
    project_file: String,
    row_id: i64,
    lineage: i64,
    logical_time: i64,
) -> Result<Vec<TensorHistoryExtra>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    Ok(project
        .find_predecessor_candidates(row_id, lineage, logical_time)
        .await
        .unwrap())
}

#[tauri::command]
pub async fn projects_db_image_rebuild_fts(app: tauri::AppHandle) -> Result<(), String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    projects_db.rebuild_images_fts().await.unwrap();
    Ok(())
}

#[tauri::command]
pub async fn projects_db_watch_folder_list(
    app: tauri::AppHandle,
) -> Result<Vec<entity::watch_folders::Model>, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    Ok(projects_db.list_watch_folders().await.unwrap())
}

#[tauri::command]
pub async fn projects_db_watch_folder_add(
    app: tauri::AppHandle,
    path: String,
    item_type: entity::watch_folders::ItemType,
    recursive: bool,
) -> Result<entity::watch_folders::Model, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    Ok(projects_db
        .add_watch_folder(&path, item_type, recursive)
        .await
        .unwrap())
}

#[tauri::command]
pub async fn projects_db_watch_folder_remove(
    app: tauri::AppHandle,
    ids: Vec<i64>,
) -> Result<(), String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    projects_db.remove_watch_folders(ids).await.unwrap();
    Ok(())
}

#[tauri::command]
pub async fn projects_db_watch_folder_update(
    app: tauri::AppHandle,
    id: i32,
    recursive: bool,
) -> Result<entity::watch_folders::Model, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    Ok(projects_db
        .update_watch_folder(id, recursive)
        .await
        .unwrap())
}

#[tauri::command]
pub async fn projects_db_scan_model_info(
    app: tauri::AppHandle,
    file_path: String,
    model_type: entity::models::ModelType,
) -> Result<(), String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    projects_db
        .scan_model_info(&file_path, model_type)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_project(
    app: tauri::AppHandle,
    project_path: Option<String>,
    project_id: Option<i64>,
) -> Result<std::sync::Arc<DTProject>, String> {
    let project_ref = match project_id {
        Some(pid) => ProjectRef::Id(pid),
        None => match project_path {
            Some(path) => ProjectRef::Path(path),
            None => return Err("No project specified".to_string()),
        },
    };
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let project = projects_db.get_dt_project(project_ref).await?;
    Ok(project)
}
