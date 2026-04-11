use std::{
    fmt::Error,
    io::{BufWriter, Cursor},
    sync::{Arc, Mutex},
};

use once_cell::sync::Lazy;
use tauri::http::{Response, StatusCode};

use crate::projects_db::{
    dtm_dtproject::DTPResource, dtos::tensor::TensorRaw, tensors::decompress_fzip, DTProject,
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
            Some(e) => (e as usize + 1).min(audio.len()), // +1 because inclusive
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

    let dtp = DTProject::get(project_path)
        .await
        .map_err(|e| format!("Failed to open project: {}", e))?;

    let tensor = dtp
        .get_tensor_raw(&resource.item_id)
        .await
        .map_err(|e| format!("Failed to get tensor raw: {}", e))?;

    let audio = decode_audio(tensor, resource.duration.unwrap_or(0.0)).await?;
    let audio_arc = Arc::new(audio);

    {
        let mut cache = AUDIO_CACHE.lock().unwrap();
        *cache = Some(CachedAudio {
            key: key.clone(),
            data: audio_arc.clone(),
        });
    }

    Ok(audio_arc)
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

    let decompressed = decompress_fzip(&tensor.data).unwrap();
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

    SAMPLE_RATES
        .iter()
        .min_by_key(|&r| (r - rate).abs())
        .unwrap()
        .clone() as u32
}
