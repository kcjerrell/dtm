use crate::{ffmpeg::{get_ffmpeg_path, get_ffprobe_path}, IntoTAResult, TAResult};
use tauri::AppHandle;
use tokio::process::Command;

#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> TAResult<String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await.into_ta_result()?;
    let ffprobe_path = get_ffprobe_path(&app).await.into_ta_result()?;

    let (cmd, args) = if ffprobe_path.exists() {
        (
            ffprobe_path,
            vec![
                "-v".to_string(),
                "quiet".to_string(),
                "-print_format".to_string(),
                "json".to_string(),
                "-show_format".to_string(),
                "-show_streams".to_string(),
                path,
            ],
        )
    } else {
        (
            ffmpeg_path,
            vec![
                "-i".to_string(),
                path,
                "-f".to_string(),
                "ffmetadata".to_string(),
                "-".to_string(),
            ],
        )
    };

    let output = Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(anyhow::Error::msg).into_ta_result()?;

    let stdout = match output.status.success() {
        true => String::from_utf8_lossy(&output.stdout).to_string(),
        false => {
            log::warn!(
                "video metadata: {}",
                String::from_utf8_lossy(&output.stderr).to_string()
            );
            return Ok(String::default());
        }
    };

    Ok(stdout)
}

#[tauri::command]
pub async fn get_video_thumbnail(app: AppHandle, path: String) -> TAResult<Vec<u8>> {
    let ffmpeg_path = get_ffmpeg_path(&app).await.into_ta_result()?;

    let output = Command::new(ffmpeg_path)
        .args([
            "-ss",
            "00:00:01",
            "-i",
            &path,
            "-vframes",
            "1",
            "-c:v",
            "png",
            "-f",
            "image2pipe",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(anyhow::Error::msg).into_ta_result()?;

    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(anyhow::anyhow!(String::from_utf8_lossy(&output.stderr).to_string()).into())
    }
}
