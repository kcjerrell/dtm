use serde_json::Value;
use tauri::Emitter;

use crate::projects_db::{
    dt_project::{ProjectRef, TensorHistoryExtra, TensorRaw},
    filters::ListImagesFilter,
    projects_db::{ListImagesResult, ModelExtra, ProjectExtra},
    tensors::decode_tensor,
    DTProject, ProjectsDb, TensorHistoryImport,
};

#[derive(serde::Serialize, Clone)]
struct InvalidateTagsPayload {
    tag: String,
    desc: String,
}

#[derive(serde::Serialize, Clone)]
struct UpdateTagsPayload {
    tag: String,
    data: Value,
}

fn invalidate_tags(app_handle: &tauri::AppHandle, tag: &str, desc: &str) {
    let _ = app_handle.emit(
        "invalidate-tags",
        InvalidateTagsPayload {
            tag: tag.to_string(),
            desc: desc.to_string(),
        },
    );
}

fn update_tags(app_handle: &tauri::AppHandle, tag: &str, data: Value) {
    let _ = app_handle.emit(
        "update-tags",
        UpdateTagsPayload {
            tag: tag.to_string(),
            data,
        },
    );
}

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
    update_tags(
        &app_handle,
        "projects",
        serde_json::json!({
            "added": project
        }),
    );
    Ok(project)
}

#[tauri::command]
pub async fn projects_db_project_remove(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    let result = pdb.remove_project(&path).await.map_err(|e| e.to_string())?;

    match result {
        Some(id) => {
            update_tags(
                &app_handle,
                "projects",
                serde_json::json!({
                    "removed": id
                }),
            );
        }
        None => {}
    }
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
pub async fn projects_db_project_update_exclude(
    app_handle: tauri::AppHandle,
    id: i32,
    exclude: bool,
) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    pdb.update_exclude(id, exclude)
        .await
        .map_err(|e| e.to_string())?;
    invalidate_tags(&app_handle, "projects", "update");
    invalidate_tags(&app_handle, &format!("projects:{id}"), "update");
    Ok(())
}

#[tauri::command]
pub async fn projects_db_project_scan(
    app: tauri::AppHandle,
    path: String,
    full_scan: Option<bool>,
    filesize: Option<i64>,
    modified: Option<i64>,
) -> Result<i32, String> {
    let pdb = ProjectsDb::get_or_init(&app).await?;
    // let update = |images_scanned: i32, images_total: i32| {
    //     app.emit(
    //         "projects_db_scan_progress",
    //         ScanProgress {
    //             projects_scanned: 0,
    //             projects_total: 1,
    //             project_final: -1,
    //             project_path: path.clone(),
    //             images_scanned,
    //             images_total,
    //         },
    //     )
    //     .unwrap();
    // };
    let result: Result<(i64, u64), String> = pdb
        .scan_project(&path, full_scan.unwrap_or(false))
        .await
        .map_err(|e| e.to_string());

    match result {
        Ok((_id, total)) => {
            let project = pdb
                .update_project(&path, filesize, modified)
                .await
                .map_err(|e| e.to_string())?;

            if total > 0 {
                let project = pdb
                    .get_project(project.id)
                    .await
                    .map_err(|e| e.to_string())?;

                let project_json = serde_json::json!({
                    "updated": project
                });

                update_tags(&app, "projects", project_json);
            }
            // app.emit(
            //     "projects_db_scan_progress",
            //     ScanProgress {
            //         projects_scanned: 1,
            //         projects_total: 1,
            //         project_final: total as i32,
            //         project_path: path.clone(),
            //         images_scanned: -1,
            //         images_total: -1,
            //     },
            // )
            // .unwrap();
            Ok(total as i32)
        }
        Err(err) => {
            eprintln!("Error scanning project {}: {}", path, err);
            Err(err.to_string())
        }
    }
}

#[tauri::command]
pub async fn projects_db_image_list(
    app: tauri::AppHandle,
    project_ids: Option<Vec<i64>>,
    search: Option<String>,
    filters: Option<Vec<ListImagesFilter>>,
    sort: Option<String>,
    direction: Option<String>,
    take: Option<i32>,
    skip: Option<i32>,
    count: Option<bool>,
) -> Result<ListImagesResult, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let opts = super::projects_db::ListImagesOptions {
        project_ids,
        search,
        filters,
        sort,
        direction,
        take,
        skip,
        count,
    };

    Ok(projects_db.list_images(opts).await.unwrap())
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
    item_type: entity::enums::ItemType,
    recursive: bool,
) -> Result<entity::watch_folders::Model, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let result = projects_db
        .add_watch_folder(&path, item_type, recursive)
        .await
        .unwrap();

    invalidate_tags(&app, "watchfolders", "add");

    Ok(result)
}

#[tauri::command]
pub async fn projects_db_watch_folder_remove(
    app: tauri::AppHandle,
    ids: Vec<i64>,
) -> Result<(), String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    projects_db.remove_watch_folders(ids).await.unwrap();
    invalidate_tags(&app, "watchfolders", "remove");
    Ok(())
}

#[tauri::command]
pub async fn projects_db_watch_folder_update(
    app: tauri::AppHandle,
    id: i32,
    recursive: Option<bool>,
    last_updated: Option<i64>,
) -> Result<entity::watch_folders::Model, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let result = projects_db
        .update_watch_folder(id, recursive, last_updated)
        .await
        .unwrap();
    invalidate_tags(&app, &format!("watchfolders:{}", id), "update");
    Ok(result)
}

#[tauri::command]
pub async fn projects_db_scan_model_info(
    app: tauri::AppHandle,
    file_path: String,
    model_type: entity::enums::ModelType,
) -> Result<usize, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    let count = projects_db
        .scan_model_info(&file_path, model_type)
        .await
        .map_err(|e| e.to_string())?;

    if count > 0 {
        invalidate_tags(&app, "models", "scan");
    }

    Ok(count)
}

#[tauri::command]
pub async fn projects_db_list_models(
    app: tauri::AppHandle,
    model_type: Option<entity::enums::ModelType>,
) -> Result<Vec<ModelExtra>, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;
    Ok(projects_db
        .list_models(model_type)
        .await
        .map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn dt_project_get_tensor_history(
    project_file: String,
    index: u32,
    count: u32,
) -> Result<Vec<TensorHistoryImport>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    match project.get_histories(index as i64, count as i64).await {
        Ok(history) => Ok(history),
        Err(_e) => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn dt_project_get_text_history(
    project_file: String,
) -> Result<Vec<crate::projects_db::TextHistoryNode>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    Ok(project.get_text_history().await.unwrap())
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
pub async fn dt_project_get_tensor_size(
    app: tauri::AppHandle,
    project_id: Option<i64>,
    project_path: Option<String>,
    tensor_id: String,
) -> Result<crate::projects_db::dt_project::TensorSize, String> {
    let project = get_project(app, project_path, project_id).await.unwrap();
    let tensor = project.get_tensor_size(&tensor_id).await.unwrap();
    Ok(tensor)
}

#[tauri::command]
pub async fn dt_project_decode_tensor(
    app: tauri::AppHandle,
    project_id: Option<i64>,
    project_file: Option<String>,
    node_id: Option<i64>,
    tensor_id: String,
    as_png: bool,
) -> Result<tauri::ipc::Response, String> {
    let project = get_project(app, project_file, project_id).await.unwrap();
    let tensor = project.get_tensor_raw(&tensor_id).await.unwrap();
    let metadata = match node_id {
        Some(node) => Some(project.get_history_full(node).await.unwrap().history),
        None => None,
    };

    let buffer = decode_tensor(tensor, as_png, metadata, None).unwrap();
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
