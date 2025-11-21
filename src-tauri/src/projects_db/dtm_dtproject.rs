use migration::ExprTrait;
use once_cell::sync::Lazy;
use sea_orm::DbErr;
use std::{
    collections::HashMap,
    error::Error,
    sync::{Arc, LazyLock, RwLock},
};
use tauri::{
    http::{self, Response},
    UriSchemeResponder,
};

use crate::projects_db::{
    tensors::{decode_tensor, scribble_mask_to_png},
    DTProject, ProjectsDb,
};

// dtm://dtm_dtproject/thumbhalf/5/82988
// dtm://dtm_dtproject/{item type}/{project_id}/{item id}

static PROJECT_PATH_CACHE: Lazy<RwLock<HashMap<u64, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

pub async fn dtm_dtproject_protocol<T>(request: http::Request<T>, responder: UriSchemeResponder) {
    let path: Vec<&str> = request.uri().path().split('/').collect();
    let item_type = path[1];
    let project_id: i64 = path[2].parse().unwrap();
    let project_path = get_project_path(project_id as u64).await.unwrap();
    let item_id = path[3];

    let query = request.uri().query();
    let node: Option<i64> = get_node(query).and_then(|n| n.parse().ok());
    let scale: Option<u32> = get_scale(query).and_then(|s| s.parse().ok());

    match item_type {
        "thumb" => thumb(&project_path, item_id, false, responder)
            .await
            .unwrap(),
        "thumbhalf" => thumb(&project_path, item_id, true, responder)
            .await
            .unwrap(),
        "tensor" => tensor(&project_path, item_id, node, scale, responder)
            .await
            .unwrap(),
        _ => responder.respond(
            Response::builder()
                .status(404)
                .body("Not Found".as_bytes().to_vec())
                .unwrap(),
        ),
    };
}

async fn thumb(
    path: &str,
    item_id: &str,
    half: bool,
    responder: UriSchemeResponder,
) -> Result<(), DbErr> {
    let id: i64 = item_id.parse().unwrap();
    let dtp = DTProject::get(path).await.unwrap();
    let thumb = match half {
        true => dtp.get_thumb_half(id).await.unwrap(),
        false => dtp.get_thumb(id).await.unwrap(),
    };
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

async fn tensor(
    project_file: &str,
    name: &str,
    node: Option<i64>,
    scale: Option<u32>,
    responder: UriSchemeResponder,
) -> Result<(), String> {
    let dtp = DTProject::get(project_file).await.unwrap();
    let tensor = dtp.get_tensor_raw(name).await.unwrap();

    let metadata = match node {
        Some(node) => {
            Some(dtp.get_history_full(node).await.unwrap().history)
        }
        None => None,
    };

    let body = match classify_type(name).unwrap_or("") {
        "pose" => None,
        "tensor_history" | "custom" | "shuffle" | "depth_map" | "color_palette" => {
            let mut png = decode_tensor(tensor, true, metadata, scale).unwrap();
            Some(png)
        }
        "scribble" | "binary_mask" => {
            let png = scribble_mask_to_png(tensor).unwrap();
            Some(png)
        }
        _ => None,
    };

    let builder = match body {
        Some(body) => Response::builder()
            .status(200)
            .header(http::header::CONTENT_TYPE, mime::IMAGE_PNG.essence_str())
            .body(body)
            .unwrap(),
        None => Response::builder()
            .status(400)
            .body("".as_bytes().to_vec())
            .unwrap(),
    };

    responder.respond(builder);

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

fn classify_type(s: &str) -> Option<&str> {
    s.rsplit_once('_').map(|(prefix, _)| prefix)
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

fn get_node(query: Option<&str>) -> Option<&str> {
    match query {
        Some(query) => query.split('&').find_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            (k == "node").then_some(v)
        }),
        None => None,
    }
}

fn get_scale(query: Option<&str>) -> Option<&str> {
    match query {
        Some(query) => query.split('&').find_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            (k == "s").then_some(v)
        }),
        None => None,
    }
}
