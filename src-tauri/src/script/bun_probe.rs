//! Build-time Bun sidecar viability checks.
//!
//! This module deliberately exposes neither a Tauri command nor a general script API.  Its fixed
//! programs prove that the pinned sidecar starts and that its entire process group can be stopped.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

pub const BUN_VERSION: &str = "1.4.3";
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const START_TIMEOUT: Duration = Duration::from_secs(10);

const NOOP_PROGRAM: &str = "void 0";
#[cfg(unix)]
const CANCELLATION_PROGRAM: &str = r#"
const child = Bun.spawn(["/bin/sh", "-c", "trap '' TERM; echo $$; while read line; do :; done"] , {
  stdin: "pipe", stdout: "pipe", stderr: "inherit"
});
const firstOutput = await child.stdout.getReader().read();
const childPid = new TextDecoder().decode(firstOutput.value).trim();
process.on("SIGTERM", () => console.log("TERM_OBSERVED"));
console.log(`READY:${childPid}`);
await new Promise(() => {});
"#;

/// Path used by Tauri before bundling. Tauri selects the file with the current target suffix from
/// the `externalBin` entry and installs it beside the application executable as `bun`.
pub fn prepared_sidecar_path(target_triple: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("bun-{target_triple}"))
}

#[cfg(test)]
fn supported_target_triple(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("linux", "x86_64") => Some("x86_64-unknown-linux-gnu"),
        ("linux", "aarch64") => Some("aarch64-unknown-linux-gnu"),
        ("macos", "x86_64") => Some("x86_64-apple-darwin"),
        ("macos", "aarch64") => Some("aarch64-apple-darwin"),
        _ => None,
    }
}

#[cfg(test)]
fn compilation_target_triple() -> Option<&'static str> {
    supported_target_triple(std::env::consts::OS, std::env::consts::ARCH)
}

/// Locate Bun in an installed application bundle without consulting `PATH`.
pub fn bundled_sidecar_path(current_exe: &Path) -> Result<PathBuf> {
    let directory = current_exe.parent().with_context(|| {
        format!(
            "application executable has no parent: {}",
            current_exe.display()
        )
    })?;
    Ok(directory.join("bun"))
}

pub async fn validate_version(path: &Path) -> Result<()> {
    let output = tokio::time::timeout(
        VERSION_TIMEOUT,
        Command::new(path).arg("--version").output(),
    )
    .await
    .with_context(|| format!("timed out validating Bun at {}", path.display()))?
    .with_context(|| format!("failed to start Bun at {}", path.display()))?;
    if !output.status.success() {
        bail!(
            "Bun version check failed at {} with {}",
            path.display(),
            output.status
        );
    }
    let actual = String::from_utf8(output.stdout).context("Bun version output was not UTF-8")?;
    if actual.trim() != BUN_VERSION {
        bail!(
            "Bun version mismatch at {}: expected {}, got {:?}",
            path.display(),
            BUN_VERSION,
            actual.trim()
        );
    }
    Ok(())
}

pub async fn run_noop(path: &Path) -> Result<()> {
    validate_version(path).await?;
    let status = Command::new(path)
        .args(["--eval", NOOP_PROGRAM])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .with_context(|| format!("failed to run pinned Bun probe at {}", path.display()))?;
    if !status.success() {
        bail!("pinned Bun no-op probe exited with {status}");
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationOutcome {
    Graceful,
    Forced,
}

#[cfg(unix)]
fn signal_group(pid: u32, signal: libc::c_int) -> Result<()> {
    let pid = i32::try_from(pid).context("Bun process ID exceeded i32")?;
    // A negative pid addresses the process group created for this child.
    if unsafe { libc::kill(-pid, signal) } == 0 {
        return Ok(());
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        return Ok(());
    }
    Err(error).context("failed to signal Bun process group")
}

#[cfg(unix)]
async fn terminate_group(mut child: Child, grace: Duration) -> Result<CancellationOutcome> {
    let pid = child.id().context("Bun probe had no process ID")?;
    signal_group(pid, libc::SIGTERM)?;
    match tokio::time::timeout(grace, child.wait()).await {
        Ok(status) => {
            status.context("failed waiting for gracefully terminated Bun probe")?;
            Ok(CancellationOutcome::Graceful)
        }
        Err(_) => {
            signal_group(pid, libc::SIGKILL)?;
            child
                .wait()
                .await
                .context("failed waiting for force-killed Bun probe")?;
            Ok(CancellationOutcome::Forced)
        }
    }
}

/// Run only the fixed cancellation probe and return its child pid for process-group verification.
#[cfg(unix)]
pub async fn run_cancellation_probe(
    path: &Path,
    grace: Duration,
) -> Result<(CancellationOutcome, u32)> {
    validate_version(path).await?;
    let mut command = Command::new(path);
    command
        .args(["--eval", CANCELLATION_PROGRAM])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    std::os::unix::process::CommandExt::process_group(command.as_std_mut(), 0);
    let mut child = command.spawn().with_context(|| {
        format!(
            "failed to start Bun cancellation probe at {}",
            path.display()
        )
    })?;
    let stdout = child
        .stdout
        .take()
        .context("Bun probe stdout was not piped")?;
    let mut lines = BufReader::new(stdout).lines();
    let child_pid = tokio::time::timeout(START_TIMEOUT, async {
        while let Some(line) = lines
            .next_line()
            .await
            .context("failed reading Bun probe output")?
        {
            if let Some(value) = line.strip_prefix("READY:") {
                return value
                    .parse::<u32>()
                    .context("invalid child pid from Bun probe");
            }
        }
        bail!("Bun cancellation probe exited before becoming ready")
    })
    .await
    .context("timed out waiting for Bun cancellation probe readiness")??;
    let outcome = terminate_group(child, grace).await?;
    Ok((outcome, child_pid))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn executable(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(target_os = "linux")]
    fn process_is_running(pid: u32) -> bool {
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
            return false;
        };
        // A killed descendant can remain briefly as an init-owned zombie. It cannot execute and
        // is therefore no longer a surviving member of the cancelled workload.
        stat.rsplit_once(") ")
            .and_then(|(_, fields)| fields.chars().next())
            .is_some_and(|state| state != 'Z')
    }

    #[cfg(all(unix, not(target_os = "linux")))]
    fn process_is_running(pid: u32) -> bool {
        (unsafe { libc::kill(pid as i32, 0) }) == 0
    }

    #[tokio::test]
    async fn rejects_a_version_mismatch() {
        let directory = tempfile::tempdir().unwrap();
        let fake = executable(directory.path(), "bun", "echo 0.0.0");
        let error = validate_version(&fake).await.unwrap_err().to_string();
        assert!(error.contains("expected 1.4.3, got \"0.0.0\""));
    }

    #[test]
    fn constructs_target_and_bundle_paths() {
        assert!(prepared_sidecar_path("aarch64-apple-darwin")
            .ends_with("binaries/bun-aarch64-apple-darwin"));
        assert_eq!(
            bundled_sidecar_path(Path::new("/Applications/DTM.app/Contents/MacOS/DTM")).unwrap(),
            Path::new("/Applications/DTM.app/Contents/MacOS/bun")
        );
    }

    #[test]
    fn maps_supported_compilation_targets_to_bun_artifacts() {
        assert_eq!(
            supported_target_triple("linux", "x86_64"),
            Some("x86_64-unknown-linux-gnu")
        );
        assert_eq!(
            supported_target_triple("linux", "aarch64"),
            Some("aarch64-unknown-linux-gnu")
        );
        assert_eq!(
            supported_target_triple("macos", "x86_64"),
            Some("x86_64-apple-darwin")
        );
        assert_eq!(
            supported_target_triple("macos", "aarch64"),
            Some("aarch64-apple-darwin")
        );
        assert_eq!(supported_target_triple("windows", "x86_64"), None);
        assert_eq!(supported_target_triple("linux", "riscv64"), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn pinned_bun_runs_noop_and_force_kills_descendant_group() {
        let Some(target) = compilation_target_triple() else {
            eprintln!(
                "skipping prepared Bun integration test; unsupported compilation target {}-{}",
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            return;
        };
        let path = prepared_sidecar_path(target);
        if !path.is_file() {
            eprintln!(
                "skipping prepared Bun integration test; {} is absent",
                path.display()
            );
            return;
        }
        run_noop(&path).await.unwrap();
        let (outcome, descendant) = run_cancellation_probe(&path, Duration::from_millis(100))
            .await
            .unwrap();
        assert_eq!(outcome, CancellationOutcome::Forced);
        assert!(!process_is_running(descendant));
    }
}
