//! Private validated output copies, independent of mutable runs and DTPService.
//!
//! The service supplies an authorized output root, retains a lease for the last-good
//! preview, and invokes expire/evict/clear at its cleanup boundary. Revoking a token
//! prevents new lookups; leases retain the copy until last drop. IO and decoding are
//! blocking: async callers must use a blocking worker. No run files are ever deleted.
use super::{
    executor::{ExecutionOutput, PreparedExecution},
    input::{selection_token, validate_image, InputLimits},
    types::OutputMetadata,
};
use anyhow::{bail, Context, Result};
use std::{
    collections::VecDeque,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex, Weak},
    time::{Duration, Instant},
};
use tempfile::TempDir;

#[derive(Clone, Copy)]
pub struct OutputLimits {
    pub image: InputLimits,
    pub token_lifetime: Duration,
    pub max_tokens: usize,
    /// Counts registry files AND revoked files still held by leases. Admission fails
    /// when pinned files exhaust capacity. Serialized validation temporarily uses at
    /// most one additional image.max_file_bytes file before admission.
    pub max_retained_bytes: u64,
}
impl Default for OutputLimits {
    fn default() -> Self {
        Self {
            image: InputLimits::default(),
            token_lifetime: Duration::from_secs(3600),
            max_tokens: 16,
            max_retained_bytes: 256 * 1024 * 1024,
        }
    }
}
/// Backend authorization captured from the prepared run directory BEFORE user code starts.
/// Holds a stable directory handle, so replacing run/output (or the run path itself)
/// with a symlink cannot authorize outside files. Keep this alongside backend run state.
pub struct AuthorizedOutputRoot {
    directory: File,
    canonical: PathBuf,
    supplied: PathBuf,
}
impl AuthorizedOutputRoot {
    /// Capture after prepare and before execute_prepared consumes the preparation.
    pub fn from_prepared(prepared: &PreparedExecution) -> Result<Self> {
        Self::open(&prepared.run_directory)
    }
    pub fn open(prepared_run_directory: &Path) -> Result<Self> {
        let name = prepared_run_directory
            .file_name()
            .context("invalid run root")?;
        let parent = prepared_run_directory
            .parent()
            .context("invalid run root")?
            .canonicalize()
            .context("invalid run root parent")?;
        let canonical = parent.join(name);
        #[cfg(unix)]
        let directory = {
            // Walk canonical parent components without following any concurrently swapped
            // symlinks. The final run component is never canonicalized or followed.
            let filesystem_root = File::open("/")?;
            let parent_handle = open_beneath(&filesystem_root, parent.strip_prefix("/")?, true)?;
            open_beneath(&parent_handle, Path::new(name), true)?
        };
        #[cfg(not(unix))]
        let directory = {
            bail!("secure output opening is unsupported on this platform");
            #[allow(unreachable_code)]
            File::open(&canonical)?
        };
        Ok(Self {
            directory,
            canonical,
            supplied: prepared_run_directory.to_path_buf(),
        })
    }
}

struct RetainedOutput {
    directory: TempDir,
    metadata: OutputMetadata,
}
/// Explicit preview/response ownership; no public filesystem path.
#[derive(Clone)]
pub struct OutputLease(Arc<RetainedOutput>);
impl OutputLease {
    pub fn metadata(&self) -> &OutputMetadata {
        &self.0.metadata
    }
    /// Owned bytes survive the lease and registry; protocol responses need no disk pin.
    pub fn read(&self) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        File::open(self.0.directory.path().join("image"))?
            .take(self.0.metadata.byte_length.saturating_add(1))
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 != self.0.metadata.byte_length {
            bail!("retained output changed");
        }
        Ok(bytes)
    }
}
struct Entry {
    token: String,
    expires: Instant,
    output: OutputLease,
}
#[derive(Default)]
struct State {
    entries: VecDeque<Entry>,
    live: Vec<Weak<RetainedOutput>>,
}
pub struct OutputRegistry {
    root: PathBuf,
    limits: OutputLimits,
    state: Mutex<State>,
}
impl OutputRegistry {
    /// Root must be backend-controlled and outside run directories; never expose its
    /// location to the runner. The root must outlive all leases. Owns only created temp
    /// directories, never the root. This is not OS isolation from same-user scripts.
    pub fn new(private_root: &Path, limits: OutputLimits) -> Result<Self> {
        if limits.max_tokens == 0 || limits.max_retained_bytes == 0 {
            bail!("output retention limits must be positive");
        }
        let root = private_root
            .canonicalize()
            .context("invalid output storage")?;
        if !root.is_dir() {
            bail!("invalid output storage");
        }
        Ok(Self {
            root,
            limits,
            state: Mutex::default(),
        })
    }
    /// authorized_root comes from backend run state, never the runner/frontend.
    /// Declared media type is ignored; only the copied validated bytes determine MIME.
    pub fn register(
        &self,
        authorized_root: &AuthorizedOutputRoot,
        output: &ExecutionOutput,
    ) -> Result<OutputLease> {
        self.register_at(authorized_root, output, Instant::now())
    }
    fn register_at(
        &self,
        authorized_root: &AuthorizedOutputRoot,
        output: &ExecutionOutput,
        now: Instant,
    ) -> Result<OutputLease> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("output registry unavailable"))?;
        state.entries.retain(|entry| entry.expires > now);
        let mut source = open_output(authorized_root, &output.path)?;
        if source.metadata()?.len() > self.limits.image.max_file_bytes {
            bail!("output exceeds byte limit");
        }
        let directory = tempfile::Builder::new()
            .prefix("script-output-")
            .tempdir_in(&self.root)
            .context("failed to retain output")?;
        let path = directory.path().join("image");
        let mut destination = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)?;
        let length = copy_bounded(
            &mut source,
            &mut destination,
            self.limits.image.max_file_bytes,
        )?;
        destination.flush()?;
        drop(destination);
        let media_type = validate_image(&path, self.limits.image)?;
        let mut permissions = std::fs::metadata(&path)?.permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions)?;
        let token = selection_token()?;
        let expires = now
            .checked_add(self.limits.token_lifetime)
            .context("output lifetime overflow")?;
        if length > self.limits.max_retained_bytes {
            bail!("output exceeds retention budget");
        }
        state.live.retain(|weak| weak.strong_count() > 0);
        loop {
            let retained = state
                .live
                .iter()
                .filter_map(Weak::upgrade)
                .fold(0u64, |sum, value| {
                    sum.saturating_add(value.metadata.byte_length)
                });
            if retained.saturating_add(length) <= self.limits.max_retained_bytes {
                break;
            }
            // Revoking a pinned token cannot free storage. Evict registry-only files first.
            let Some(index) = state
                .entries
                .iter()
                .position(|entry| Arc::strong_count(&entry.output.0) == 1)
            else {
                bail!("output retention capacity exhausted");
            };
            state.entries.remove(index);
        }
        while state.entries.len() >= self.limits.max_tokens {
            state.entries.pop_front();
        }
        let lease = OutputLease(Arc::new(RetainedOutput {
            directory,
            metadata: OutputMetadata {
                preview_url: format!("dtm://script-output/{token}"),
                media_type,
                byte_length: length,
                width: None,
                height: None,
            },
        }));
        state.live.push(Arc::downgrade(&lease.0));
        state.entries.push_back(Entry {
            token,
            expires,
            output: lease.clone(),
        });
        Ok(lease)
    }
    pub fn acquire(&self, token: &str) -> Result<OutputLease> {
        self.acquire_at(token, Instant::now())
    }
    fn acquire_at(&self, token: &str, now: Instant) -> Result<OutputLease> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("output registry unavailable"))?;
        state.entries.retain(|entry| entry.expires > now);
        state
            .entries
            .iter()
            .find(|entry| entry.token == token)
            .map(|entry| entry.output.clone())
            .context("unknown or expired output")
    }
    /// Periodic service cleanup; expiry also runs on access. Does not revoke active leases.
    pub fn expire(&self, now: Instant) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("output registry unavailable"))?;
        state.entries.retain(|entry| entry.expires > now);
        state.live.retain(|weak| weak.strong_count() > 0);
        Ok(())
    }
    pub fn evict(&self, token: &str) -> Result<()> {
        self.state
            .lock()
            .map_err(|_| anyhow::anyhow!("output registry unavailable"))?
            .entries
            .retain(|entry| entry.token != token);
        Ok(())
    }
    pub fn clear(&self) -> Result<()> {
        self.state
            .lock()
            .map_err(|_| anyhow::anyhow!("output registry unavailable"))?
            .entries
            .clear();
        Ok(())
    }
}
fn copy_bounded(reader: &mut impl Read, writer: &mut impl Write, maximum: u64) -> Result<u64> {
    let mut total = 0u64;
    let mut buffer = [0; 64 * 1024];
    loop {
        let remaining = maximum
            .saturating_sub(total)
            .saturating_add(1)
            .min(buffer.len() as u64) as usize;
        let count = reader.read(&mut buffer[..remaining])?;
        if count == 0 {
            return Ok(total);
        }
        total = total
            .checked_add(count as u64)
            .context("output size overflow")?;
        if total > maximum {
            bail!("output exceeds byte limit");
        }
        writer.write_all(&buffer[..count])?;
    }
}
fn open_output(root: &AuthorizedOutputRoot, path: &Path) -> Result<File> {
    let relative = if path.is_absolute() {
        path.strip_prefix(&root.canonical)
            .or_else(|_| path.strip_prefix(&root.supplied))
            .context("output outside authorized root")?
    } else {
        path
    };
    // Only the fixed output subtree is authorized, never run source/input/manifest files.
    if relative.components().next() != Some(Component::Normal(std::ffi::OsStr::new("output")))
        || relative.components().count() < 2
    {
        bail!("output outside authorized output directory");
    }
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|v| !matches!(v, Component::Normal(_)))
    {
        bail!("invalid output path");
    }
    #[cfg(unix)]
    let file = open_beneath(&root.directory, relative, false)?;
    #[cfg(not(unix))]
    let file = {
        bail!("secure output opening is unsupported on this platform");
        #[allow(unreachable_code)]
        File::open(root.canonical.join(relative))?
    };
    if !file.metadata()?.is_file() {
        bail!("output is not a regular file");
    }
    Ok(file)
}

#[cfg(unix)]
fn open_beneath(parent: &File, relative: &Path, directory: bool) -> Result<File> {
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::ffi::OsStrExt,
        },
    };
    let mut current = parent.try_clone()?;
    let components: Vec<_> = relative.components().collect();
    for (index, component) in components.iter().enumerate() {
        if !matches!(component, Component::Normal(_)) {
            bail!("invalid output component");
        }
        let name =
            CString::new(component.as_os_str().as_bytes()).context("invalid output component")?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if directory || index + 1 < components.len() {
                libc::O_DIRECTORY
            } else {
                0
            };
        // SAFETY: current and name are live. A successful call returns a new owned fd.
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(std::io::Error::last_os_error()).context("failed to open output");
        }
        // SAFETY: fd is a newly opened descriptor uniquely owned here.
        current = unsafe { File::from_raw_fd(fd) };
    }
    Ok(current)
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use std::{fs, io::Cursor};
    pub fn image(format: image::ImageFormat) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(2, 2, image::Rgb([1, 2, 3])))
            .write_to(&mut out, format)
            .unwrap();
        out.into_inner()
    }
    pub fn execution(path: impl Into<PathBuf>) -> ExecutionOutput {
        let path = path.into();
        let path = if path.is_absolute() {
            path
        } else {
            Path::new("output").join(path)
        };
        ExecutionOutput {
            path,
            media_type: "image/png".into(),
        }
    }
    fn token(lease: &OutputLease) -> &str {
        lease
            .metadata()
            .preview_url
            .strip_prefix("dtm://script-output/")
            .unwrap()
    }
    fn files(root: &Path) -> usize {
        fs::read_dir(root).unwrap().count()
    }

    #[test]
    fn detects_copied_bytes_preserves_leases_and_cleans_on_last_drop() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let store = tempfile::tempdir().unwrap();
        let registry = OutputRegistry::new(
            store.path(),
            OutputLimits {
                max_tokens: 1,
                ..OutputLimits::default()
            },
        )
        .unwrap();
        let bytes = image(image::ImageFormat::Jpeg);
        let path = output.join("misleading.png");
        fs::write(&path, &bytes).unwrap();
        let first = registry.register(&authorized, &execution(&path)).unwrap();
        assert_eq!(first.metadata().media_type, "image/jpeg");
        assert_eq!(first.metadata().byte_length, bytes.len() as u64);
        assert_eq!(token(&first).len(), 64);
        assert!(token(&first).bytes().all(|b| b.is_ascii_hexdigit()));
        assert!(!first
            .metadata()
            .preview_url
            .contains(&run.path().display().to_string()));
        let response_lease = registry.acquire(token(&first)).unwrap();
        // Mutation and removal of the original never change the privately validated result.
        fs::write(&path, b"mutated invalid bytes").unwrap();
        fs::remove_file(&path).unwrap();
        assert_eq!(first.read().unwrap(), bytes);
        fs::write(&path, image(image::ImageFormat::Png)).unwrap();
        let second = registry.register(&authorized, &execution(&path)).unwrap();
        assert!(registry.acquire(token(&first)).is_err());
        assert_ne!(token(&first), token(&second));
        assert_eq!(files(store.path()), 2);
        drop(first);
        assert_eq!(files(store.path()), 2);
        assert_eq!(response_lease.read().unwrap(), bytes);
        drop(response_lease);
        assert_eq!(files(store.path()), 1);
        registry.clear().unwrap();
        assert_eq!(files(store.path()), 1);
        drop(registry);
        assert_eq!(second.read().unwrap(), image(image::ImageFormat::Png));
        drop(second);
        assert_eq!(files(store.path()), 0);
        assert!(path.exists());
    }
    #[test]
    fn deterministic_expiry_and_explicit_eviction_preserve_leases() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let store = tempfile::tempdir().unwrap();
        let registry = OutputRegistry::new(store.path(), OutputLimits::default()).unwrap();
        let path = output.join("image");
        fs::write(&path, image(image::ImageFormat::Png)).unwrap();
        let now = Instant::now();
        let lease = registry
            .register_at(&authorized, &execution(&path), now)
            .unwrap();
        assert!(registry
            .acquire_at(token(&lease), now + Duration::from_secs(3599))
            .is_ok());
        registry.expire(now + Duration::from_secs(3600)).unwrap();
        assert!(registry.acquire(token(&lease)).is_err());
        assert!(registry.acquire(&"f".repeat(64)).is_err());
        assert!(lease.read().is_ok());
        drop(lease);
        assert_eq!(files(store.path()), 0);
        let lease = registry.register(&authorized, &execution(&path)).unwrap();
        registry.evict(token(&lease)).unwrap();
        assert!(registry.acquire(token(&lease)).is_err());
        assert!(lease.read().is_ok());
        drop(lease);
        assert_eq!(files(store.path()), 0);
    }
    #[test]
    fn rejects_traversal_missing_files_directories_and_symlink_escapes() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let store = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let registry = OutputRegistry::new(store.path(), OutputLimits::default()).unwrap();
        fs::write(
            outside.path().join("outside"),
            image(image::ImageFormat::Png),
        )
        .unwrap();
        fs::create_dir(output.join("nested")).unwrap();
        for path in [
            PathBuf::from("../outside"),
            PathBuf::from("nested/../../outside"),
            outside.path().join("outside"),
            output.join("missing"),
            output.join("nested"),
        ] {
            assert!(registry.register(&authorized, &execution(path)).is_err());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink(outside.path().join("outside"), output.join("escape")).unwrap();
            symlink(outside.path(), output.join("dir")).unwrap();
            for path in ["escape", "dir/outside"] {
                assert!(registry.register(&authorized, &execution(path)).is_err());
            }
            // Also fail closed on contained symlinks, removing directory-swap races.
            fs::write(output.join("valid"), image(image::ImageFormat::Png)).unwrap();
            symlink("valid", output.join("link")).unwrap();
            assert!(registry.register(&authorized, &execution("link")).is_err());
            let fifo = output.join("fifo");
            use std::{ffi::CString, os::unix::ffi::OsStrExt};
            let name = CString::new(fifo.as_os_str().as_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
            assert!(registry.register(&authorized, &execution(fifo)).is_err());
        }
        assert_eq!(files(store.path()), 0);
    }
    #[test]
    fn malformed_unsupported_encoded_and_decode_limits_fail_without_retention() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let store = tempfile::tempdir().unwrap();
        let png = image(image::ImageFormat::Png);
        let defaults = OutputLimits::default();
        let path = output.join("image.png");
        for (bytes, limits) in [
            (b"GIF89aunsupported".to_vec(), defaults),
            (b"garbage".to_vec(), defaults),
            (png[..png.len() / 2].to_vec(), defaults),
            (
                png.clone(),
                OutputLimits {
                    image: InputLimits {
                        max_file_bytes: (png.len() - 1) as u64,
                        ..defaults.image
                    },
                    ..defaults
                },
            ),
            (
                png.clone(),
                OutputLimits {
                    image: InputLimits {
                        max_dimension: 1,
                        ..defaults.image
                    },
                    ..defaults
                },
            ),
            (
                png.clone(),
                OutputLimits {
                    image: InputLimits {
                        max_decode_bytes: 1,
                        ..defaults.image
                    },
                    ..defaults
                },
            ),
        ] {
            fs::write(&path, bytes).unwrap();
            let registry = OutputRegistry::new(store.path(), limits).unwrap();
            assert!(registry.register(&authorized, &execution(&path)).is_err());
            assert_eq!(files(store.path()), 0);
        }
        let registry = OutputRegistry::new(store.path(), defaults).unwrap();
        fs::write(&path, &png).unwrap();
        let mut declared = execution(&path);
        declared.media_type = "application/octet-stream".into();
        assert_eq!(
            registry
                .register(&authorized, &declared)
                .unwrap()
                .metadata()
                .media_type,
            "image/png"
        );
    }
    #[test]
    fn actual_reads_are_bounded_even_if_source_grows_after_metadata_check() {
        let run = tempfile::tempdir().unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let path = output.join("growing");
        fs::write(&path, [1; 4]).unwrap();
        let mut reader = File::open(&path).unwrap();
        assert_eq!(reader.metadata().unwrap().len(), 4);
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&[2; 8])
            .unwrap();
        let mut copy = Vec::new();
        assert!(copy_bounded(&mut reader, &mut copy, 4).is_err());
        assert!(copy.len() <= 4);
        let mut copy = Vec::new();
        assert_eq!(
            copy_bounded(&mut Cursor::new([1; 4]), &mut copy, 4).unwrap(),
            4
        );
    }
    #[test]
    fn retention_budget_counts_revoked_leases_and_evicts_unleased_entries() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let store = tempfile::tempdir().unwrap();
        let bytes = image(image::ImageFormat::Png);
        let path = output.join("image");
        fs::write(&path, &bytes).unwrap();
        let registry = OutputRegistry::new(
            store.path(),
            OutputLimits {
                max_retained_bytes: bytes.len() as u64,
                ..OutputLimits::default()
            },
        )
        .unwrap();
        let lease = registry.register(&authorized, &execution(&path)).unwrap();
        registry.evict(token(&lease)).unwrap();
        assert!(registry.register(&authorized, &execution(&path)).is_err());
        assert_eq!(files(store.path()), 1);
        drop(lease);
        assert_eq!(files(store.path()), 0);
        let lease = registry.register(&authorized, &execution(&path)).unwrap();
        let old = token(&lease).to_owned();
        drop(lease);
        let lease = registry.register(&authorized, &execution(&path)).unwrap();
        assert!(registry.acquire(&old).is_err());
        assert_eq!(files(store.path()), 1);
        registry.clear().unwrap();
        drop(lease);
        assert_eq!(files(store.path()), 0);
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_root_and_output_root_replacement_and_non_output_run_files() {
        use std::os::unix::fs::symlink;
        let parent = tempfile::tempdir().unwrap();
        let store = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let run = parent.path().join("run");
        fs::create_dir(&run).unwrap();
        let anchor = AuthorizedOutputRoot::open(&run).unwrap();
        let registry = OutputRegistry::new(store.path(), OutputLimits::default()).unwrap();
        let bytes = image(image::ImageFormat::Png);
        fs::write(outside.path().join("image"), &bytes).unwrap();
        symlink(outside.path(), run.join("output")).unwrap();
        assert!(AuthorizedOutputRoot::open(&run.join("output")).is_err());
        assert!(registry
            .register(&anchor, &execution(run.join("output/image")))
            .is_err());
        fs::remove_file(run.join("output")).unwrap();
        fs::create_dir(run.join("output")).unwrap();
        fs::write(run.join("output/image"), &bytes).unwrap();
        fs::write(run.join("process.ts"), &bytes).unwrap();
        fs::write(run.join("manifest.json"), &bytes).unwrap();
        for path in ["process.ts", "manifest.json"] {
            assert!(registry
                .register(
                    &anchor,
                    &ExecutionOutput {
                        path: run.join(path),
                        media_type: "image/png".into()
                    }
                )
                .is_err());
        }
        // Even replacing the run pathname cannot redirect the previously captured handle.
        fs::create_dir(outside.path().join("output")).unwrap();
        fs::write(
            outside.path().join("output/image"),
            b"outside malformed data",
        )
        .unwrap();
        fs::rename(&run, parent.path().join("old-run")).unwrap();
        symlink(outside.path(), &run).unwrap();
        assert!(AuthorizedOutputRoot::open(&run).is_err());
        let lease = registry
            .register(&anchor, &execution(run.join("output/image")))
            .unwrap();
        assert_eq!(lease.read().unwrap(), bytes);
    }
    #[tokio::test]
    async fn real_bun_prepared_output_reaches_protocol_and_survives_run_cleanup() {
        use crate::script::{
            bun::BunExecutor,
            bun_probe::prepared_sidecar_path,
            executor::{ExecutionRequest, ExecutionTerminal, ScriptExecutor},
            protocol,
            types::{RunId, RunManifest},
        };
        use tauri::http::{header, Request, StatusCode};
        let runs = tempfile::tempdir().unwrap();
        let store = tempfile::tempdir().unwrap();
        let target = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => "aarch64-apple-darwin",
            ("macos", "x86_64") => "x86_64-apple-darwin",
            ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
            ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
            _ => panic!("unsupported Bun target"),
        };
        let executor = BunExecutor::new(prepared_sidecar_path(target));
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/script/contracts/fixtures/contracts.json"
        ))
        .unwrap();
        let mut manifest: RunManifest =
            serde_json::from_value(fixture["runManifest"].clone()).unwrap();
        manifest.identity.run_id = RunId("output-preview-test".into());
        let expected = image(image::ImageFormat::Png);
        let source = format!(
            "createImageProcess(() => Uint8Array.from({}))",
            serde_json::to_string(&expected).unwrap()
        );
        manifest.source.source = source.clone();
        manifest.source.instrumented_source = source;
        manifest.source.source_map = None;
        manifest.inputs.clear();
        manifest.values.clear();
        let prepared = executor
            .prepare(ExecutionRequest {
                runs_root: runs.path().into(),
                manifest,
                timeout: Duration::from_secs(5),
            })
            .await
            .unwrap();
        // Capture while the backend exclusively owns the prepared directory, before spawn.
        let authorized = AuthorizedOutputRoot::from_prepared(&prepared).unwrap();
        let (_tx, rx) = tokio::sync::watch::channel(None);
        let result = executor.execute_prepared(prepared, rx).await.unwrap();
        let ExecutionTerminal::Succeeded(output) = result.terminal else {
            panic!("expected real Bun success: {:?}", result.terminal);
        };
        let registry = OutputRegistry::new(store.path(), OutputLimits::default()).unwrap();
        let lease = registry.register(&authorized, &output).unwrap();
        fs::remove_dir_all(runs.path().join("output-preview-test")).unwrap();
        let request = Request::builder()
            .uri(&lease.metadata().preview_url)
            .body(Vec::new())
            .unwrap();
        let response = protocol::respond(&registry, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "image/png");
        registry.clear().unwrap();
        drop(lease);
        assert_eq!(files(store.path()), 0);
        assert_eq!(response.body(), &expected);
    }
}
