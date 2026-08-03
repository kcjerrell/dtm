use std::{
    io::{BufWriter, Cursor},
    sync::{Arc, Mutex},
};

use once_cell::sync::Lazy;
use tauri::http::{Response, StatusCode};

use crate::{
    projects_db::{
        dt_project::{DTResource, TensorRaw},
        dtm_dtproject::DTPResource,
        tensors::decompress_fzip,
        DtProjectRef, DtResourceHandle, DtResourceRef, ThnRef, ThnResource,
    },
    ResourceHandle,
};

struct CachedAudio {
    key: String,
    data: Arc<Vec<u8>>,
}

static AUDIO_CACHE: Lazy<Mutex<Option<CachedAudio>>> = Lazy::new(|| Mutex::new(None));

pub async fn audio_request(
    project_path: &str,
    resource: &DTPResource,
) -> Result<Response<Vec<u8>>, String> {
    let audio = get_audio(project_path, resource).await?;

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

pub async fn get_audio(project_path: &str, resource: &DTPResource) -> Result<Arc<Vec<u8>>, String> {
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
        .map_err(|_| "Invalid item ID".to_string())?;

    let res = DtResourceHandle::new(
        &DtProjectRef::Path(project_path.to_string()),
        &DtResourceRef::TensorHistoryNode(ThnRef::RowId(item_id), ThnResource::None),
    );

    if let Some(audio) = res.get_audio().await.map_err(|e| e.to_string())? {
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
        Err("Audio not found".to_string())
    }
}

pub async fn decode_audio(tensor: TensorRaw, duration: f64) -> Result<Vec<u8>, String> {
    let channels = tensor.n;
    let length = tensor.height as usize;

    let sample_rate = determine_sample_rate(duration, length);

    let spec = hound::WavSpec {
        channels: channels as u16,
        sample_format: hound::SampleFormat::Float,
        bits_per_sample: 32,
        sample_rate,
    };

    let mut buffer = Vec::new();
    let buf_writer = BufWriter::new(Cursor::new(&mut buffer));

    let mut writer = hound::WavWriter::new(buf_writer, spec).unwrap();

    // Extract bytes from DTResource
    let data = match &tensor.resource {
        DTResource::CompressedTensor(compressed) => compressed.data().to_vec(),
        DTResource::Unknown(bytes) => bytes.clone(),
        DTResource::DTZipRef(_) => {
            return Err("DTZipRef not yet supported in decode_audio".to_string())
        }
        DTResource::JpgInFbs(_) => {
            return Err("JpgWithHeader not supported in decode_audio".to_string())
        }
    };

    let decompressed = decompress_fzip(&data).unwrap();
    let left = &decompressed[0..length];
    let right = &decompressed[length..];

    for i in 0..length {
        writer.write_sample(left[i]).unwrap();
        writer.write_sample(right[i]).unwrap();
    }

    writer.finalize().unwrap();

    Ok(buffer)
}

const SAMPLE_RATES: [i32; 2] = [48000, 24000];

fn determine_sample_rate(duration: f64, length: usize) -> u32 {
    // currently the only possible sample rates are 48000 and 24000
    // we will use the closest one
    if duration <= 0.0 {
        return 24000;
    }

    let rate = (length as f64 / duration) as i32;
    log::debug!(
        "Determining sample rate for duration {} and length {} ({})",
        duration,
        length,
        rate
    );

    *SAMPLE_RATES
        .iter()
        .min_by_key(|&r| (r - rate).abs())
        .unwrap() as u32
}
