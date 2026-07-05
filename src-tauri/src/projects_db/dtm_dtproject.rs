use tauri::{
    http::{self, Response, StatusCode, Uri},
    UriSchemeResponder,
};

use crate::{
    projects_db::{
        audio::audio_request,
        decode_audio,
        dt_resource_handle::DtResourceHandle,
        enums::{DtProjectRef, DtResourceRef, ThnRef, ThnResource},
        DTProject, ProjectsDb,
    },
    ResourceHandle,
};

const MISSING_SVG: &str = r##"<?xml version="1.0" encoding="utf-8"?>
<svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M87.4474 43.7443C90.8991 43.7443 93.6974 46.5425 93.6974 49.9943C93.6974 49.9943 93.6974 93.7443 93.6974 93.7443C93.6974 97.1961 90.8991 99.9943 87.4474 99.9943C83.9956 99.9943 81.1974 97.1961 81.1974 93.7443C81.1974 93.7443 81.1974 49.9943 81.1974 49.9943C81.1974 46.5425 83.9956 43.7443 87.4474 43.7443ZM78.0724 121.869C78.0724 127.047 82.2697 131.244 87.4474 131.244C92.625 131.244 96.8224 127.047 96.8224 121.869C96.8224 116.692 92.625 112.494 87.4474 112.494C82.2697 112.494 78.0724 116.692 78.0724 121.869ZM174.947 87.4943C174.957 90.8011 173.643 93.9743 171.299 96.3068C171.299 96.3068 96.2599 171.354 96.2599 171.354C91.3844 176.2 83.5104 176.2 78.6349 171.354C78.6349 171.354 78.6349 171.354 78.6349 171.354C78.6349 171.354 3.63491 96.3068 3.63491 96.3068C-1.21164 91.4313 -1.21164 83.5573 3.63491 78.6818C3.63491 78.6818 78.674 3.63491 78.674 3.63491C83.5494 -1.21164 91.4235 -1.21164 96.299 3.63491C96.299 3.63491 171.338 78.6818 171.338 78.6818C173.668 81.0207 174.967 84.1931 174.947 87.4943C174.947 87.4943 174.947 87.4943 174.947 87.4943ZM162.447 87.4943L87.4474 12.4943L12.4474 87.4943L87.4474 162.494L87.4474 162.494L162.447 87.4943Z" fill="#77777733" stroke-width="0" stroke="#77777733" transform="translate(12.553 12.506)" />
  </g>
</svg>"##;

// dtm://dtm_dtproject/thumbhalf/5/82988
// dtm://dtm_dtproject/{item type}/{project_id}/{item id}

// note: while audio is technically a tensor type, it is better served from a different route
// dtm://dtm_dtproject/audio/{project_id}/{item_id}

#[derive(Default)]
pub struct DTPResource {
    pub item_type: String,
    pub project_id: i64,
    pub item_id: String,
    pub node: Option<i64>,
    pub size: Option<u32>,
    pub mask: Option<String>,
    pub range_start: Option<usize>,
    pub range_end: Option<usize>,
}

fn parse_request<T>(request: &http::Request<T>) -> Option<DTPResource> {
    let uri = request.uri();
    let path: Vec<&str> = uri.path().split('/').collect();
    if path.len() < 4 {
        return None;
    }

    let mut resource = DTPResource {
        item_type: path[1].to_string(),
        project_id: path[2].parse().unwrap(),
        item_id: path[3].to_string(),
        ..Default::default()
    };

    if let Some(range) = request.headers().get("Range") {
        let range = range.to_str().unwrap();

        if let Some(range) = range.strip_prefix("bytes=") {
            let mut parts = range.split('-');

            let start = parts.next().unwrap();
            let end = parts.next().unwrap_or("");

            resource.range_start = if start.is_empty() {
                None
            } else {
                Some(start.parse::<usize>().unwrap())
            };

            resource.range_end = if end.is_empty() {
                None
            } else {
                Some(end.parse::<usize>().unwrap())
            };
        }
    }

    if let Some(query) = uri.query() {
        for q in query.split('&') {
            let (key, value) = q.split_once('=').unwrap();
            match key {
                "node" => resource.node = Some(value.parse().unwrap()),
                "s" => resource.size = Some(value.parse().unwrap()),
                "mask" => resource.mask = Some(value.to_string()),
                _ => (),
            }
        }
    }

    Some(resource)
}

pub struct DtmProtocol {
    pdb: ProjectsDb,
}

impl DtmProtocol {
    pub fn new(pdb: ProjectsDb) -> Self {
        Self { pdb }
    }

    pub async fn dtm_dtproject_protocol<T>(
        &self,
        request: http::Request<T>,
        responder: UriSchemeResponder,
    ) {
        let uri = &request.uri().to_string();
        let response = match self.handle_request(request).await {
            Ok(r) => r,
            Err(e) => {
                log::error!("DTM Protocol Error for ({}): {}", uri, e);
                // Response::builder()
                //     .status(StatusCode::INTERNAL_SERVER_ERROR)
                //     .body(e.into_bytes())
                //     .unwrap()
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "image/svg+xml")
                    .body(MISSING_SVG.as_bytes().to_vec())
                    .unwrap()
            }
        };

        responder.respond(response);
    }

    async fn handle_request<T>(
        &self,
        request: http::Request<T>,
    ) -> Result<Response<Vec<u8>>, String> {
        let req = parse_request(&request);

        if req.is_none() {
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body("Invalid path format".as_bytes().to_vec())
                .map_err(|e| e.to_string())?);
        }

        let req = req.unwrap();

        match req.item_type.as_str() {
            "thumb" => thumb(req.project_id, &req.item_id, false).await,
            "thumbhalf" => thumb(req.project_id, &req.item_id, true).await,
            "tensor" => {
                tensor(
                    req.project_id,
                    &req.item_id,
                    req.node,
                    req.size,
                    req.mask.as_deref(),
                )
                .await
            }
            "audio" => {
                let project_path = self
                    .pdb
                    .get_project_path(req.project_id)
                    .await
                    .map_err(|e| format!("Failed to get project path: {}", e))?;
                audio_request(&project_path, &req).await
            }
            _ => Ok(Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body("Not Found".as_bytes().to_vec())
                .map_err(|e| e.to_string())?),
        }
    }
}

async fn thumb(project_id: i64, item_id: &str, half: bool) -> Result<Response<Vec<u8>>, String> {
    let preview_id: i64 = item_id.parse().map_err(|_| "Invalid item ID".to_string())?;

    let project_ref = DtProjectRef::Id(project_id);
    let resource_ref = DtResourceRef::Thumb(preview_id);
    let handle = DtResourceHandle::new(project_ref, resource_ref);

    let thumb = handle
        .get_preview(half)
        .await
        .map_err(|e| format!("Failed to get preview: {}", e))?;

    let thumb = thumb.ok_or("Failed to get preview".to_string())?;

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "image/jpeg")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET")
        .body(thumb)
        .map_err(|e| e.to_string())
}

// Unsupported options by DtResourceHandle API:
// - mask: NOT supported - mask parameter not available through DtResourceHandle
// Note: size parameter IS supported through get_lossless()
async fn tensor(
    project_id: i64,
    name: &str,
    node: Option<i64>,
    size: Option<u32>,
    _mask: Option<&str>,
) -> Result<Response<Vec<u8>>, String> {
    let project_ref = DtProjectRef::Id(project_id);

    let resource_ref = if let Some(node_id) = node {
        // Use TensorHistoryNode with ThnRef::RowId and ThnResource::Tensor(name) to ensure metadata can be included
        DtResourceRef::TensorHistoryNode(
            ThnRef::RowId(node_id),
            ThnResource::Tensor(name.to_string()),
        )
    } else {
        DtResourceRef::Tensor(name.to_string())
    };

    let handle = DtResourceHandle::new(project_ref, resource_ref);

    let tensor_type = classify_type(name).unwrap_or("");

    // Handle pose type separately as it doesn't return PNG
    if tensor_type == "pose" {
        return Ok(Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(
                "Unsupported tensor type or decoding failed"
                    .as_bytes()
                    .to_vec(),
            )
            .map_err(|e| e.to_string())?);
    }

    if tensor_type == "audio" {
        panic!("audio requests should use dtm://dtm_dtproject/audio/project_id/item_id")
    }

    let body = handle
        .get_lossless(size)
        .await
        .map_err(|e| format!("Failed to get lossless: {}", e))?
        .ok_or("Failed to get lossless".to_string())?;

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "image/png")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET")
        .body(body)
        .map_err(|e| e.to_string())
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
