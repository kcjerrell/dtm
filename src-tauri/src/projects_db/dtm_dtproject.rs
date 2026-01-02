use once_cell::sync::Lazy;
use sea_orm::DbErr;
use std::{collections::HashMap, sync::RwLock};
use tauri::{
    http::{self, Response, StatusCode, Uri},
    UriSchemeResponder,
};

use crate::projects_db::{
    tensors::{decode_tensor, scribble_mask_to_png},
    DTProject, ProjectsDb,
};

// dtm://dtm_dtproject/thumbhalf/5/82988
// dtm://dtm_dtproject/{item type}/{project_id}/{item id}

static PROJECT_PATH_CACHE: Lazy<RwLock<HashMap<i64, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

#[derive(Default)]
struct DTPRequest {
    item_type: String,
    project_id: i64,
    item_id: String,
    node: Option<i64>,
    scale: Option<u32>,
    invert: Option<bool>,
    mask: Option<String>,
}

fn parse_request(uri: &Uri) -> Option<DTPRequest> {
    let path: Vec<&str> = uri.path().split('/').collect();
    if path.len() < 4 {
        return None;
    }

    let mut req = DTPRequest {
        item_type: path[1].to_string(),
        project_id: path[2].parse().unwrap(),
        item_id: path[3].to_string(),
        ..Default::default()
    };

    if let Some(query) = uri.query() {
        for q in query.split('&') {
            let (key, value) = q.split_once('=').unwrap();
            match key {
                "node" => req.node = Some(value.parse().unwrap()),
                "s" => req.scale = Some(value.parse().unwrap()),
                "invert" => req.invert = Some(value.parse().unwrap()),
                "mask" => req.mask = Some(value.to_string()),
                _ => (),
            }
        }
    }

    Some(req)
}

pub async fn dtm_dtproject_protocol<T>(request: http::Request<T>, responder: UriSchemeResponder) {
    let response = match handle_request(request).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("DTM Protocol Error: {}", e);
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(e.into_bytes())
                .unwrap()
        }
    };

    responder.respond(response);
}

async fn handle_request<T>(request: http::Request<T>) -> Result<Response<Vec<u8>>, String> {
    let req = parse_request(request.uri());

    if req.is_none() {
        return Ok(Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body("Invalid path format".as_bytes().to_vec())
            .map_err(|e| e.to_string())?);
    }

    let req = req.unwrap();

    let item_type = req.item_type;
    let project_id: i64 = req.project_id;

    let project_path = get_project_path(project_id)
        .await
        .map_err(|e| format!("Failed to get project path: {}", e))?;

    let item_id = req.item_id;

    let node = req.node;
    let scale = req.scale;  
    let invert = req.invert;
    let mask = req.mask;

    match item_type.as_str() {
        "thumb" => thumb(&project_path, &item_id, false).await,
        "thumbhalf" => thumb(&project_path, &item_id, true).await,
        "tensor" => tensor(&project_path, &item_id, node, scale, invert, mask).await,
        _ => Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body("Not Found".as_bytes().to_vec())
            .map_err(|e| e.to_string())?),
    }
}

async fn thumb(path: &str, item_id: &str, half: bool) -> Result<Response<Vec<u8>>, String> {
    let id: i64 = item_id.parse().map_err(|_| "Invalid item ID".to_string())?;

    let dtp = DTProject::get(path)
        .await
        .map_err(|e| format!("Failed to open project: {}", e))?;

    let thumb = match half {
        true => dtp.get_thumb_half(id).await,
        false => dtp.get_thumb(id).await,
    };

    let thumb = thumb.map_err(|e| format!("Failed to get thumb: {}", e))?;

    let thumb = extract_jpeg_slice(&thumb).ok_or("Failed to extract JPEG slice".to_string())?;

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "image/jpeg")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET")
        .body(thumb)
        .map_err(|e| e.to_string())
}

async fn tensor(
    project_file: &str,
    name: &str,
    node: Option<i64>,
    scale: Option<u32>,
    invert: Option<bool>,
    mask: Option<String>,
) -> Result<Response<Vec<u8>>, String> {
    let dtp = DTProject::get(project_file)
        .await
        .map_err(|e| format!("Failed to open project: {}", e))?;

    let tensor = dtp
        .get_tensor_raw(name)
        .await
        .map_err(|e| format!("Failed to get tensor raw: {}", e))?;

    let metadata = match node {
        Some(node) => Some(
            dtp.get_history_full(node)
                .await
                .map_err(|e| format!("Failed to get history: {}", e))?
                .history,
        ),
        None => None,
    };

    let body = match classify_type(name).unwrap_or("") {
        "pose" => None,
        "tensor_history" | "custom" | "shuffle" | "depth_map" | "color_palette" => {
            let png = decode_tensor(tensor, true, metadata, scale)
                .map_err(|e| format!("Failed to decode tensor: {}", e))?;
            Some(png)
        }
        "scribble" | "binary_mask" => {
            let png = scribble_mask_to_png(tensor, scale, invert)
                .map_err(|e| format!("Failed to convert mask to png: {}", e))?;
            Some(png)
        }
        _ => None,
    };

    match body {
        Some(body) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "image/png")
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET")
            .body(body)
            .map_err(|e| e.to_string()),
        None => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(
                "Unsupported tensor type or decoding failed"
                    .as_bytes()
                    .to_vec(),
            )
            .map_err(|e| e.to_string()),
    }
}

async fn get_project_path(project_id: i64) -> Result<String, DbErr> {
    if let Some(path) = PROJECT_PATH_CACHE.read().unwrap().get(&project_id).cloned() {
        return Ok(path);
    }

    let pdb = ProjectsDb::get().map_err(|e| DbErr::Custom(e.to_string()))?;
    let project = pdb.get_project(project_id).await?;
    PROJECT_PATH_CACHE
        .write()
        .unwrap()
        .insert(project_id, project.path.clone());
    Ok(project.path)
}

fn classify_type(s: &str) -> Option<&str> {
    s.rsplit_once('_').map(|(prefix, _)| prefix)
}

pub fn extract_jpeg_slice(data: &[u8]) -> Option<Vec<u8>> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_type() {
        assert_eq!(classify_type("pose_123"), Some("pose"));
        assert_eq!(classify_type("tensor_history_abc"), Some("tensor_history"));
        assert_eq!(classify_type("unknown"), None);
    }

    #[test]
    fn test_get_node() {
        assert_eq!(get_node(Some("node=123&foo=bar")), Some("123"));
        assert_eq!(get_node(Some("foo=bar&node=456")), Some("456"));
        assert_eq!(get_node(Some("foo=bar")), None);
        assert_eq!(get_node(None), None);
    }

    #[test]
    fn test_get_scale() {
        assert_eq!(get_scale(Some("s=2&foo=bar")), Some("2"));
        assert_eq!(get_scale(Some("foo=bar&s=4")), Some("4"));
        assert_eq!(get_scale(Some("foo=bar")), None);
        assert_eq!(get_scale(None), None);
    }

    #[test]
    fn test_extract_jpeg_slice() {
        let data = vec![
            0x00, 0x00, // Garbage
            0xFF, 0xD8, // SOI
            0x01, 0x02, // Content
            0xFF, 0xD9, // EOI
            0x00, 0x00, // Garbage
        ];
        let extracted = extract_jpeg_slice(&data).unwrap();
        assert_eq!(extracted, vec![0xFF, 0xD8, 0x01, 0x02, 0xFF, 0xD9]);

        let no_soi = vec![0x01, 0x02, 0xFF, 0xD9];
        assert!(extract_jpeg_slice(&no_soi).is_none());

        let no_eoi = vec![0xFF, 0xD8, 0x01, 0x02];
        assert!(extract_jpeg_slice(&no_eoi).is_none());
    }
}
