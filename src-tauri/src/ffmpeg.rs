use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs;
use tokio::process::Command;

const FFMPEG_URL: &str = "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z";
const FFMPEG_SHA256: &str = "845140e046f7abbfcf480d70eb1657ca09eb8fa775834518a1f43a5b867c96f9";

const FFPROBE_URL: &str = "https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z";
const FFPROBE_SHA256: &str = "58e55ca02ad775d7a0776e050ce74752262fc2e622ba04d08b8f79e3f81251cd";

#[derive(Clone, serde::Serialize, Default)]
struct DownloadProgress {
    progress: f64,
    total: Option<u64>,
    received: u64,
    msg: Option<String>,
    state: Option<String>,
}

pub async fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?
        .join("bin")
        .join("ffmpeg"))
}

pub async fn get_ffprobe_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?
        .join("bin")
        .join("ffprobe"))
}

pub async fn check_ffmpeg(app: &AppHandle) -> Result<bool> {
    let ffmpeg_path = get_ffmpeg_path(app).await?;
    let ffprobe_path = get_ffprobe_path(app).await?;
    Ok(ffmpeg_path.exists() && ffprobe_path.exists())
}

pub async fn download_ffmpeg(app: AppHandle) -> Result<()> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?;
    let temp_dir = app_data_dir.join("temp");
    fs::create_dir_all(&temp_dir)
        .await
        .context("Failed to create temp dir")?;

    let bin_dir = app_data_dir.join("bin");
    fs::create_dir_all(&bin_dir)
        .await
        .context("Failed to create bin dir")?;

    let tasks = [
        ("ffmpeg", FFMPEG_URL, FFMPEG_SHA256),
        ("ffprobe", FFPROBE_URL, FFPROBE_SHA256),
    ];

    let mut total_downloaded: u64 = 0;
    let mut task_sizes: Vec<Option<u64>> = vec![None; tasks.len()];
    let client = ::reqwest::Client::new();

    for (i, (name, url, sha256)) in tasks.iter().enumerate() {
        let archive_path = temp_dir.join(format!("{}.7z", name));
        let has_valid_cached_archive =
            archive_path.exists() && verify_checksum(&archive_path, sha256).is_ok_and(|v| v);

        if !has_valid_cached_archive {
            let res = client
                .get(*url)
                .send()
                .await
                .context("Failed to send download request")?;

            let content_length = res.content_length();
            task_sizes[i] = content_length;

            let mut stream = res.bytes_stream();
            let mut file =
                std::fs::File::create(&archive_path).context("Failed to create archive file")?;

            let mut last_emit = std::time::Instant::now();
            let emit_interval = std::time::Duration::from_millis(200);

            while let Some(item) = stream.next().await {
                let chunk = item.context("Failed to read download chunk")?;
                file.write_all(&chunk).context("Failed to write chunk")?;
                total_downloaded += chunk.len() as u64;

                if last_emit.elapsed() >= emit_interval {
                    // Estimate total size
                    let first_known_size = task_sizes.iter().find_map(|s| *s);
                    let estimated_total: u64 = task_sizes
                        .iter()
                        .enumerate()
                        .map(|(j, s)| {
                            s.unwrap_or_else(|| {
                                if j > i {
                                    first_known_size.unwrap_or(0)
                                } else {
                                    0
                                }
                            })
                        })
                        .sum();

                    let _ = app.emit(
                        "ffmpeg_download_progress",
                        DownloadProgress {
                            progress: if estimated_total > 0 {
                                total_downloaded as f64 / estimated_total as f64
                            } else {
                                0.0
                            },
                            total: Some(estimated_total),
                            received: total_downloaded,
                            msg: Some(format!("Downloading {}", name)),
                            state: Some("downloading".to_string()),
                        },
                    );
                    last_emit = std::time::Instant::now();
                }
            }
        } else {
            let _ = app.emit(
                "ffmpeg_download_progress",
                DownloadProgress {
                    msg: Some(format!("Using cached {}", name)),
                    state: Some("verifying".to_string()),
                    ..Default::default()
                },
            );
        }

        let _ = app.emit(
            "ffmpeg_download_progress",
            DownloadProgress {
                msg: Some(format!("Verifying {}", name)),
                state: Some("verifying".to_string()),
                ..Default::default()
            },
        );

        if !verify_checksum(&archive_path, sha256).is_ok_and(|v| v) {
            bail!("Signature verification failed for {}", name);
        }

        let _ = app.emit(
            "ffmpeg_download_progress",
            DownloadProgress {
                msg: Some(format!("Extracting {}", name)),
                state: Some("extracting".to_string()),
                ..Default::default()
            },
        );

        sevenz_rust::decompress_file(&archive_path, &bin_dir)
            .context("Failed to decompress archive")?;

        // Set executable permission on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let binary_path = bin_dir.join(name);
            if binary_path.exists() {
                let mut perms = fs::metadata(&binary_path)
                    .await
                    .context("Failed to read binary metadata")?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&binary_path, perms)
                    .await
                    .context("Failed to set executable permissions")?;
            }
        }

        // Remove archive after extraction
        fs::remove_file(&archive_path)
            .await
            .context("Failed to remove archive")?;
    }

    let _ = app.emit(
        "ffmpeg_download_progress",
        DownloadProgress {
            msg: Some("Done".to_string()),
            state: Some("done".to_string()),
            ..Default::default()
        },
    );

    Ok(())
}

pub async fn call_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<String> {
    let ffmpeg_path = get_ffmpeg_path(app).await?;

    if !ffmpeg_path.exists() {
        bail!("FFmpeg not found. Please download it first.");
    }

    let output = Command::new(ffmpeg_path)
        .args(args)
        .output()
        .await
        .context("Failed to spawn ffmpeg process")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        bail!("{}", String::from_utf8_lossy(&output.stderr))
    }
}

use hex::encode;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};

fn sha256_file(path: &Path) -> Result<String, std::io::Error> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    let hash = hasher.finalize();
    Ok(encode(hash))
}

fn verify_checksum(path: &Path, expected: &str) -> Result<bool, std::io::Error> {
    let actual = sha256_file(path)?;
    Ok(actual.eq_ignore_ascii_case(expected))
}
