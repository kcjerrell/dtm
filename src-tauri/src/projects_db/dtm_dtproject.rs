use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, RwLock},
};

use once_cell::sync::Lazy;
use sea_orm::DbErr;
use tauri::{
    http::{self, Response},
    UriSchemeResponder,
};

use crate::projects_db::{DTProject, ProjectsDb};

// dtm://dtm_dtproject/thumbhalf/5/82988
// dtm://dtm_dtproject/{item type}/{project_id}/{item id}

static PROJECT_PATH_CACHE: Lazy<RwLock<HashMap<u64, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

pub async fn dtm_dtproject_protocol(path: Vec<&str>, responder: UriSchemeResponder) {
    println!("dtm_dtproject_protocol: {}", path.join("/"));
    let item_type = path[0];
    let project_id: i64 = path[1].parse().unwrap();
    let project_path = get_project_path(project_id as u64).await.unwrap();
    let item_id: i64 = path[2].parse().unwrap();

    if item_type == "thumbhalf" {
        thumbhalf(&project_path, item_id, responder).await.unwrap();
    }
}

async fn thumbhalf(path: &str, item_id: i64, responder: UriSchemeResponder) -> Result<(), DbErr> {
    let dtp = DTProject::get(path).await.unwrap();
    let thumb = dtp.get_thumb_half(item_id as i64).await.unwrap();
    let thumb = extract_jpeg_slice(&thumb).unwrap();
    responder.respond(
        Response::builder()
            .status(200)
            .header(http::header::CONTENT_TYPE, mime::IMAGE_JPEG.essence_str())
            .body(thumb)
            .unwrap(),
    );

    Ok(())
}

async fn get_project_path(project_id: u64) -> Result<String, DbErr> {
    if let Some(path) = PROJECT_PATH_CACHE.read().unwrap().get(&project_id).cloned() {
        return Ok(path);
    }

    let pdb = ProjectsDb::get().unwrap();
    let project = pdb.get_project(project_id as i32).await?;
    PROJECT_PATH_CACHE
        .write()
        .unwrap()
        .insert(project_id, project.path.clone());
    Ok(project.path)
}

fn extract_jpeg_slice(data: &[u8]) -> Option<Vec<u8>> {
    // JPEG markers
    const SOI: [u8; 2] = [0xFF, 0xD8]; // Start of Image
    const EOI: [u8; 2] = [0xFF, 0xD9]; // End of Image

    // Find the start of the JPEG
    let start = data.windows(2).position(|w| w == SOI)?;
    // Find the end of the JPEG after the start
    let end = data.windows(2).skip(start + 2).position(|w| w == EOI)?;

    // Adjust end position because .position() returns relative offset
    let end = start + 2 + end + 2; // include EOI marker

    Some(data[start..end].to_vec())
}
