use std::path::PathBuf;
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_http::reqwest;
use futures_util::StreamExt;
use std::io::Write;
use tokio::fs;
use tokio::process::Command;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    progress: f64,
    total: Option<u64>,
    received: u64,
}

pub async fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("bin").join("ffmpeg"))
}

pub async fn check_ffmpeg(app: &AppHandle) -> Result<bool, String> {
    let path = get_ffmpeg_path(app).await?;
    Ok(path.exists())
}

pub async fn download_ffmpeg(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = app_data_dir.join("temp");
    fs::create_dir_all(&temp_dir).await.map_err(|e| e.to_string())?;
    
    let bin_dir = app_data_dir.join("bin");
    fs::create_dir_all(&bin_dir).await.map_err(|e| e.to_string())?;

    let ffmpeg_7z = temp_dir.join("ffmpeg.7z");
    
    // Download FFmpeg
    // The redirect to the latest .7z works through reqwest
    let url = "https://evermeet.cx/ffmpeg/get";
    let client = reqwest::Client::new();
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    let total_size = res.content_length();
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();
    
    let mut file = std::fs::File::create(&ffmpeg_7z).map_err(|e| e.to_string())?;
    
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        let _ = app.emit("ffmpeg_download_progress", DownloadProgress {
            progress: total_size.map(|s| downloaded as f64 / s as f64).unwrap_or(0.0),
            total: total_size,
            received: downloaded,
        });
    }
    
    // Extract
    // sevenz-rust can extract the .7z file directly
    sevenz_rust::decompress_file(&ffmpeg_7z, &bin_dir).map_err(|e| e.to_string())?;
    
    // Cleanup
    let _ = fs::remove_file(&ffmpeg_7z).await;
    
    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let ffmpeg_path = bin_dir.join("ffmpeg");
        if ffmpeg_path.exists() {
            let mut perms = fs::metadata(&ffmpeg_path).await.map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&ffmpeg_path, perms).await.map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub async fn call_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path(app).await?;
    
    if !ffmpeg_path.exists() {
        return Err("FFmpeg not found. Please download it first.".to_string());
    }
    
    let output = Command::new(ffmpeg_path)
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}