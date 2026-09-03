use anyhow::{bail, Context, Result};
#[cfg(target_os = "macos")]
use futures_util::StreamExt;
#[cfg(target_os = "macos")]
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(target_os = "macos")]
use tokio::fs;
use tokio::process::Command;

#[cfg(target_os = "macos")]
const FFMPEG_URL: &str = "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z";
#[cfg(target_os = "macos")]
const FFMPEG_SHA256: &str = "845140e046f7abbfcf480d70eb1657ca09eb8fa775834518a1f43a5b867c96f9";

#[cfg(target_os = "macos")]
const FFPROBE_URL: &str = "https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z";
#[cfg(target_os = "macos")]
const FFPROBE_SHA256: &str = "58e55ca02ad775d7a0776e050ce74752262fc2e622ba04d08b8f79e3f81251cd";

#[derive(Clone, serde::Serialize, Default)]
struct DownloadProgress {
    progress: f64,
    total: Option<u64>,
    received: u64,
    msg: Option<String>,
    state: Option<String>,
}

const VERSION_CHECK_TIMEOUT: Duration = Duration::from_secs(15);

#[cfg(not(target_os = "linux"))]
fn cached_tool_path(app: &AppHandle, name: &str) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?
        .join("bin")
        .join(name))
}

async fn validate_tool(path: &Path, name: &str) -> Result<()> {
    let output = tokio::time::timeout(
        VERSION_CHECK_TIMEOUT,
        Command::new(path).arg("-version").output(),
    )
    .await
    .with_context(|| format!("timed out validating {} at {}", name, path.display()))?
    .with_context(|| format!("failed to execute {} at {}", name, path.display()))?;
    let version = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success()
        || !version
            .to_ascii_lowercase()
            .contains(&format!("{name} version"))
    {
        bail!(
            "{} at {} did not identify itself as a compatible {} executable (status: {}; output: {})",
            name,
            path.display(),
            name,
            output.status,
            version.trim()
        );
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn system_tool_candidates(name: &str) -> Vec<PathBuf> {
    let override_name = format!("DTM_{}_PATH", name.to_ascii_uppercase());
    if let Some(path) = std::env::var_os(override_name).filter(|value| !value.is_empty()) {
        return vec![PathBuf::from(path)];
    }
    std::env::var_os("PATH")
        .map(|path| {
            std::env::split_paths(&path)
                .map(|dir| dir.join(name))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
async fn resolve_linux_tool_from(name: &str, candidates: Vec<PathBuf>) -> Result<PathBuf> {
    let mut failures = Vec::new();
    for path in candidates {
        if !path.is_file() {
            continue;
        }
        match validate_tool(&path, name).await {
            Ok(()) => return Ok(path),
            Err(error) => failures.push(error.to_string()),
        }
    }
    let detail = if failures.is_empty() {
        String::new()
    } else {
        format!(" Validation errors: {}", failures.join("; "))
    };
    bail!("A working system {name} executable was not found. Install it on Ubuntu with `sudo apt-get update && sudo apt-get install -y ffmpeg`, then restart DTM. You can set DTM_{}_PATH to an explicit executable.{}", name.to_ascii_uppercase(), detail)
}

async fn resolve_tool(app: &AppHandle, name: &str) -> Result<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        resolve_linux_tool_from(name, system_tool_candidates(name)).await
    }
    #[cfg(not(target_os = "linux"))]
    {
        let path = cached_tool_path(app, name)?;
        validate_tool(&path, name).await?;
        Ok(path)
    }
}

pub async fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    resolve_tool(app, "ffmpeg").await
}

pub async fn get_ffprobe_path(app: &AppHandle) -> Result<PathBuf> {
    resolve_tool(app, "ffprobe").await
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
    let mut first_run_checks = Vec::with_capacity(tasks.len());

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

        // Start the first-run work immediately so it can overlap the next download.
        let binary_path = bin_dir.join(name);
        let name = *name;
        let _ = app.emit(
            "ffmpeg_download_progress",
            DownloadProgress {
                msg: Some(format!("Preparing {} for first use", name)),
                state: Some("verifying".to_string()),
                ..Default::default()
            },
        );
        first_run_checks.push((
            name,
            tokio::spawn(async move { validate_tool(&binary_path, name).await }),
        ));
    }

    for (name, check) in first_run_checks {
        check
            .await
            .with_context(|| format!("failed to join {} first-run validation", name))??;
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

#[cfg(target_os = "linux")]
pub async fn download_ffmpeg(app: AppHandle) -> Result<()> {
    get_ffmpeg_path(&app).await?;
    get_ffprobe_path(&app).await?;
    let _ = app.emit(
        "ffmpeg_download_progress",
        DownloadProgress {
            msg: Some("System FFmpeg and FFprobe are ready".to_string()),
            state: Some("done".to_string()),
            ..Default::default()
        },
    );
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub async fn download_ffmpeg(_app: AppHandle) -> Result<()> {
    bail!("Automatic FFmpeg installation is only supported on macOS; install ffmpeg and ffprobe using your operating system package manager")
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

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn fake_tool(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[tokio::test]
    async fn resolves_a_valid_system_tool_without_network() {
        let dir = tempfile::tempdir().unwrap();
        let path = fake_tool(dir.path(), "ffmpeg", "echo 'ffmpeg version 6.1'");
        assert_eq!(
            resolve_linux_tool_from("ffmpeg", vec![path.clone()])
                .await
                .unwrap(),
            path
        );
    }

    #[tokio::test]
    async fn rejects_missing_and_invalid_executables_with_guidance() {
        let dir = tempfile::tempdir().unwrap();
        let invalid = fake_tool(dir.path(), "ffprobe", "echo not-ffprobe; exit 1");
        let error = resolve_linux_tool_from("ffprobe", vec![dir.path().join("missing"), invalid])
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains("apt-get install -y ffmpeg"));
        assert!(error.contains("did not identify itself"));
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
