use anyhow::{bail, Context, Result};
#[cfg(target_os = "macos")]
use futures_util::StreamExt;
#[cfg(target_os = "macos")]
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tokio::fs;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[cfg(target_os = "macos")]
const FFMPEG_URL: &str = "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z";
#[cfg(target_os = "macos")]
const FFMPEG_SHA256: &str = "845140e046f7abbfcf480d70eb1657ca09eb8fa775834518a1f43a5b867c96f9";

#[cfg(target_os = "macos")]
const FFPROBE_URL: &str = "https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z";
#[cfg(target_os = "macos")]
const FFPROBE_SHA256: &str = "58e55ca02ad775d7a0776e050ce74752262fc2e622ba04d08b8f79e3f81251cd";

#[cfg(target_os = "macos")]
#[derive(Clone, serde::Serialize, Default)]
struct DownloadProgress {
    progress: f64,
    total: Option<u64>,
    received: u64,
    msg: Option<String>,
    state: Option<String>,
}

#[derive(Clone, Copy)]
enum MediaTool {
    Ffmpeg,
    Ffprobe,
}

impl MediaTool {
    fn name(self) -> &'static str {
        match self {
            Self::Ffmpeg => "ffmpeg",
            Self::Ffprobe => "ffprobe",
        }
    }

    fn override_variable(self) -> &'static str {
        match self {
            Self::Ffmpeg => "DTM_FFMPEG_PATH",
            Self::Ffprobe => "DTM_FFPROBE_PATH",
        }
    }
}

pub async fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    resolve_tool(app, MediaTool::Ffmpeg).await
}

pub async fn get_ffprobe_path(app: &AppHandle) -> Result<PathBuf> {
    resolve_tool(app, MediaTool::Ffprobe).await
}

#[cfg(target_os = "macos")]
async fn resolve_tool(app: &AppHandle, tool: MediaTool) -> Result<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?
        .join("bin")
        .join(tool.name());
    validate_tool(&path, tool).await?;
    Ok(path)
}

#[cfg(target_os = "linux")]
async fn resolve_tool(_app: &AppHandle, tool: MediaTool) -> Result<PathBuf> {
    let candidate = std::env::var_os(tool.override_variable())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(tool.name()));

    validate_tool(&candidate, tool).await.with_context(|| {
        format!(
            "DTM requires a working system {} on Linux. Install it with `sudo apt-get install ffmpeg`, or set {} to a compatible executable",
            tool.name(),
            tool.override_variable()
        )
    })?;
    Ok(candidate)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
async fn resolve_tool(_app: &AppHandle, tool: MediaTool) -> Result<PathBuf> {
    bail!("{} is not supported on this platform", tool.name())
}

async fn validate_tool(path: &Path, tool: MediaTool) -> Result<()> {
    let output = timeout(
        Duration::from_secs(5),
        Command::new(path).arg("-version").output(),
    )
    .await
    .with_context(|| format!("{} validation timed out", tool.name()))?
    .with_context(|| format!("failed to execute {} at {}", tool.name(), path.display()))?;
    let version = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let expected = format!("{} version", tool.name());
    if !output.status.success() || !version.to_ascii_lowercase().contains(&expected) {
        bail!(
            "{} at {} is incompatible (expected successful `-version` output containing {:?}): {}",
            tool.name(),
            path.display(),
            expected,
            version.trim()
        );
    }
    Ok(())
}

pub async fn check_ffmpeg(app: &AppHandle) -> Result<bool> {
    Ok(get_ffmpeg_path(app).await.is_ok() && get_ffprobe_path(app).await.is_ok())
}

#[cfg(target_os = "macos")]
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

    validate_tool(&bin_dir.join("ffmpeg"), MediaTool::Ffmpeg).await?;
    validate_tool(&bin_dir.join("ffprobe"), MediaTool::Ffprobe).await?;

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

#[cfg(target_os = "linux")]
pub async fn download_ffmpeg(app: AppHandle) -> Result<()> {
    // Linux media tools are supplied by the environment; never download macOS archives.
    get_ffmpeg_path(&app).await?;
    get_ffprobe_path(&app).await?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub async fn download_ffmpeg(_app: AppHandle) -> Result<()> {
    bail!("FFmpeg installation is not supported on this platform")
}

pub async fn call_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<String> {
    let ffmpeg_path = get_ffmpeg_path(app).await?;

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

#[cfg(target_os = "macos")]
use hex::encode;
#[cfg(target_os = "macos")]
use sha2::{Digest, Sha256};
#[cfg(target_os = "macos")]
use std::fs::File;
#[cfg(target_os = "macos")]
use std::io::{BufReader, Read};

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
fn verify_checksum(path: &Path, expected: &str) -> Result<bool, std::io::Error> {
    let actual = sha256_file(path)?;
    Ok(actual.eq_ignore_ascii_case(expected))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    fn executable(contents: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("media-tool");
        std::fs::write(&path, contents).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        (directory, path)
    }

    #[tokio::test]
    async fn validates_compatible_executable() {
        let (_directory, path) = executable("#!/bin/sh\necho 'ffmpeg version 7.1'\n");
        validate_tool(&path, MediaTool::Ffmpeg).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_missing_executable() {
        let directory = TempDir::new().unwrap();
        let error = validate_tool(&directory.path().join("missing"), MediaTool::Ffprobe)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("failed to execute ffprobe"));
    }

    #[tokio::test]
    async fn rejects_invalid_executable() {
        let (_directory, path) = executable("#!/bin/sh\necho 'not ffmpeg'\n");
        let error = validate_tool(&path, MediaTool::Ffmpeg).await.unwrap_err();
        assert!(error.to_string().contains("is incompatible"));
    }

    #[tokio::test]
    async fn rejects_other_media_tool() {
        let (_directory, path) = executable("#!/bin/sh\necho 'ffprobe version 7.1'\n");
        let error = validate_tool(&path, MediaTool::Ffmpeg).await.unwrap_err();
        assert!(error.to_string().contains("ffmpeg version"));
    }
}
