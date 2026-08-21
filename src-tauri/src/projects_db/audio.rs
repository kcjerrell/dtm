use std::{
    io::{BufWriter, Cursor},
    sync::{Arc, Mutex},
};

use once_cell::sync::Lazy;
use tauri::http::{Response, StatusCode};

use crate::{
    dt_project::{DTResource, TensorRaw},
    projects_db::{
        dtm_dtproject::DTPResource, tensors::decompress_fzip, DtProjectRef, DtResourceHandle,
        DtResourceRef, ThnRef, ThnResource,
    },
    ResourceHandle,
};

struct CachedAudio {
    key: String,
    data: Arc<Vec<u8>>,
}

static AUDIO_CACHE: Lazy<Mutex<Option<CachedAudio>>> = Lazy::new(|| Mutex::new(None));

pub async fn audio_request(resource: &DTPResource) -> anyhow::Result<Response<Vec<u8>>> {
    let audio = get_audio(resource).await?;

    if resource.range_start.is_none() && resource.range_end.is_none() {
        Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "audio/wav")
            .body(audio.to_vec())
            .unwrap())
    } else {
        let start = resource.range_start.unwrap_or(0);
        let end = match resource.range_end {
            Some(e) => (e + 1).min(audio.len()), // +1 because inclusive
            None => audio.len(),
        };
        let chunk = audio[start..end].to_vec();
        Ok(Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Type", "audio/wav")
            .header(
                "Content-Range",
                format!("bytes {}-{}/{}", start, end - 1, audio.len()),
            )
            .header("Accept-Ranges", "bytes")
            .header("Content-Length", chunk.len())
            .body(chunk)
            .unwrap())
    }
}

pub async fn get_audio(resource: &DTPResource) -> anyhow::Result<Arc<Vec<u8>>> {
    let key = format!("{}/{}", resource.project_id, resource.item_id);

    {
        let cache = AUDIO_CACHE.lock().unwrap();
        if let Some(cached) = &*cache {
            if cached.key == key {
                return Ok(cached.data.clone());
            }
        }
    }

    let item_id: i64 = resource
        .item_id
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid item ID"))?;

    let res = DtResourceHandle::new(
        &DtProjectRef::Id(resource.project_id),
        &DtResourceRef::TensorHistoryNode(ThnRef::RowId(item_id), ThnResource::None),
    );

    if let Some(audio) = res.get_audio().await? {
        let audio_arc = Arc::new(audio);

        {
            let mut cache = AUDIO_CACHE.lock().unwrap();
            *cache = Some(CachedAudio {
                key: key.clone(),
                data: audio_arc.clone(),
            });
        }

        Ok(audio_arc)
    } else {
        anyhow::bail!("Audio not found")
    }
}
