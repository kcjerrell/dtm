use std::{fs::File, io::Write};

use futures::SinkExt;
use tauri::Emitter;

use crate::projects_db::{
    dt_project::TensorHistoryExtra,
    projects_db::{ImageExtra, Paged, ProjectExtra, ScanProgress},
    tensors::tensor_to_png_bytes,
    DTProject, MixedError, ProjectsDb, TensorHistory,
};

#[tauri::command]
pub async fn projects_db_get_image_count(app_handle: tauri::AppHandle) -> Result<u32, String> {
    let projects_db = ProjectsDb::get_or_init(&app_handle).await?;
    Ok(projects_db.get_image_count().await.unwrap())
}

#[tauri::command]
pub async fn projects_db_add_project(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<ProjectExtra, String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    let project = pdb.add_project(&path).await.unwrap();
    Ok(project)
}

#[tauri::command]
pub async fn projects_db_remove_project(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    pdb.remove_project(&path).await.unwrap();
    Ok(())
}

#[tauri::command]
pub async fn projects_db_list_projects(
    app_handle: tauri::AppHandle,
) -> Result<Vec<super::projects_db::ProjectExtra>, String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    let projects = pdb.list_projects().await.unwrap();
    Ok(projects)
}

#[tauri::command]
pub async fn projects_db_scan_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app).await?;
    let update = |images_scanned: i32, images_total: i32| {
        app.emit(
            "projects_db_scan_progress",
            ScanProgress {
                projects_scanned: 0,
                projects_total: 1,
                project_path: path.clone(),
                images_scanned,
                images_total,
            },
        )
        .unwrap();
    };
    pdb.scan_project(&path, update).await?;
    Ok(())
}

#[tauri::command]
pub async fn projects_db_scan_all_projects(app_handle: tauri::AppHandle) -> Result<(), String> {
    let pdb = ProjectsDb::get_or_init(&app_handle).await?;
    pdb.scan_all_projects(&app_handle).await?;
    Ok(())
}

#[tauri::command]
pub async fn projects_db_find_images(
    app: tauri::AppHandle,
    project_id: Option<u64>,
    sort: Option<String>,
    direction: Option<String>,
    model: Option<String>,
    prompt_search: String,
    take: Option<u64>,
    skip: Option<u64>,
) -> Result<Paged<ImageExtra>, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;

    let opts = super::projects_db::ListImagesOptions {
        project_id,
        sort,
        direction,
        model,
        take,
        skip,
    };

    Ok(projects_db.find_images(&prompt_search, opts).await.unwrap())
}

#[tauri::command]
pub async fn projects_db_list_images(
    app: tauri::AppHandle,
    project_id: Option<u64>,
    sort: Option<String>,
    direction: Option<String>,
    model: Option<String>,
    prompt_search: Option<String>,
    take: Option<u64>,
    skip: Option<u64>,
) -> Result<Vec<ImageExtra>, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;

    let opts = super::projects_db::ListImagesOptions {
        project_id,
        sort,
        direction,
        model,
        take,
        skip,
    };

    Ok(projects_db.list_images(opts).await.unwrap())
}

#[tauri::command]
pub async fn dt_project_get_tensor_history(
    project_file: String,
    index: u32,
    count: u32,
) -> Result<Vec<TensorHistory>, String> {
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
    skip: i64,
    take: i64,
) -> Result<Vec<TensorHistoryExtra>, String> {
    println!("dt_project_get_history_full");
    let project = DTProject::get(&project_file).await.unwrap();
    let history = project.get_history_full(skip, take).await.unwrap();
    Ok(history)
}

#[tauri::command]
pub async fn dt_project_get_tensor(project_file: String, name: String) -> Result<Vec<u8>, String> {
    let project = DTProject::get(&project_file).await.unwrap();
    let buffer = project.get_tensor(&name).await.unwrap();
    Ok(buffer)
    // let png = tensor_to_png_bytes(&buffer).unwrap();

    // let path = format!("{}.png", name);
    // let mut file = File::create(path).unwrap();
    // file.write_all(&png).unwrap();

    // Ok(png)
}
