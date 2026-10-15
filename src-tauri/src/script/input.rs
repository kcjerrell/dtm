//! Approved inputs are copied and inspected before the immutable run is prepared.
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::{BufReader, Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use tokio::sync::watch;

use super::{
    executor::PreparedExecution,
    types::{CancellationReason, MaterializedInput, SelectedInput},
};

/// A backend adapter resolves resource IDs, never caller-supplied filesystem paths.
#[async_trait]
pub trait InputResources: Send + Sync {
    async fn resolve(&self, resource_id: &str) -> Result<Arc<dyn crate::ResourceHandle>>;
}

struct Approval {
    file: Arc<File>,
    expires: Instant,
}

/// Private backend state. Only the native selection boundary may call `approve_local`.
#[derive(Default)]
pub struct InputApprovals {
    entries: Mutex<HashMap<String, Approval>>,
}

impl InputApprovals {
    pub fn approve_local(&self, path: &Path, lifetime: Duration) -> Result<String> {
        let path = path
            .canonicalize()
            .context("failed to resolve selected input")?;
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW);
        }
        let file = options
            .open(&path)
            .context("failed to open selected input")?;
        if !file.metadata()?.is_file() {
            bail!("selected input is not a regular file");
        }
        let token = selection_token()?;
        let expires = Instant::now()
            .checked_add(lifetime)
            .context("selection lifetime overflow")?;
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| anyhow::anyhow!("input approvals poisoned"))?;
        entries.retain(|_, entry| entry.expires > Instant::now());
        entries.insert(
            token.clone(),
            Approval {
                file: Arc::new(file),
                expires,
            },
        );
        Ok(token)
    }

    pub fn revoke(&self, token: &str) -> Result<()> {
        self.entries
            .lock()
            .map_err(|_| anyhow::anyhow!("input approvals poisoned"))?
            .remove(token);
        Ok(())
    }

    fn resolve(&self, token: &str) -> Result<Arc<File>> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| anyhow::anyhow!("input approvals poisoned"))?;
        entries.retain(|_, entry| entry.expires > Instant::now());
        let entry = entries
            .get(token)
            .context("unapproved or expired local input selection")?;
        Ok(entry.file.clone())
    }
}

#[derive(Debug, Clone, Copy)]
pub struct InputLimits {
    pub max_inputs: usize,
    pub max_file_bytes: u64,
    pub max_total_bytes: u64,
    pub max_dimension: u32,
    pub max_decode_bytes: u64,
}
impl Default for InputLimits {
    fn default() -> Self {
        Self {
            max_inputs: 32,
            max_file_bytes: 64 * 1024 * 1024,
            max_total_bytes: 256 * 1024 * 1024,
            max_dimension: 16384,
            max_decode_bytes: 128 * 1024 * 1024,
        }
    }
}

/// Owns private copies; dropping it (including cancellation/failure) removes them.
/// Put `inputs()` in the manifest, call executor.prepare, then consume with `transfer`.
pub struct StagedInputs {
    directory: TempDir,
    inputs: Vec<MaterializedInput>,
}
impl StagedInputs {
    pub fn inputs(&self) -> &[MaterializedInput] {
        &self.inputs
    }

    pub async fn transfer(
        self,
        prepared: PreparedExecution,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<PreparedExecution> {
        tokio::task::spawn_blocking(move || {
            if prepared.manifest().inputs != self.inputs {
                bail!("prepared input manifest differs from validated staging");
            }
            for input in &self.inputs {
                check_cancelled(&cancellation)?;
                let destination = prepared.staged_input_path(&input.input_id)?;
                let source = self.directory.path().join(&input.file_name);
                let mut reader = File::open(source)?;
                let mut writer = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(destination)
                    .context("failed to create prepared input")?;
                let (length, hash) =
                    copy_checked(&mut reader, &mut writer, input.byte_length, &cancellation)?;
                if length != input.byte_length || hash != input.content_hash {
                    bail!("validated staging bytes changed before transfer");
                }
            }
            check_cancelled(&cancellation)?;
            Ok(prepared)
        })
        .await
        .context("input transfer worker failed")?
    }
}

/// Staging root must be a backend-owned private directory, never a script run directory.
pub async fn stage_inputs(
    root: &Path,
    selections: &[SelectedInput],
    approvals: &InputApprovals,
    resources: &dyn InputResources,
    limits: InputLimits,
    mut cancellation: watch::Receiver<Option<CancellationReason>>,
) -> Result<StagedInputs> {
    check_cancelled(&cancellation)?;
    if selections.len() > limits.max_inputs {
        bail!("too many inputs");
    }
    let mut ids = HashSet::new();
    let mut sources = Vec::new();
    // IDs are opaque lookup keys; only backend-generated filenames become paths.
    for (index, selection) in selections.iter().enumerate() {
        let id = match selection {
            SelectedInput::LocalFile { input_id, .. }
            | SelectedInput::DrawThings { input_id, .. } => input_id,
        };
        if id.is_empty() || id.len() > 1024 || !ids.insert(id.clone()) {
            bail!("input IDs must be nonempty, bounded, and unique");
        }
        let local = if let SelectedInput::LocalFile {
            selection_token, ..
        } = selection
        {
            Some(approvals.resolve(selection_token)?)
        } else {
            None
        };
        sources.push((id.clone(), format!("input-{index}.image"), selection, local));
    }
    let directory = tempfile::Builder::new()
        .prefix("input-stage-")
        .tempdir_in(root)
        .context("failed to create private input staging")?;
    let mut staged = StagedInputs {
        directory,
        inputs: Vec::new(),
    };
    let mut total = 0u64;
    for (id, name, selection, local) in sources {
        check_cancelled(&cancellation)?;
        let reader: Box<dyn Read + Send> = if let Some(file) = local {
            if file.metadata()?.len() > limits.max_file_bytes {
                bail!("input exceeds byte limit");
            }
            // Positional reads avoid a shared cursor between concurrent stages of one selection.
            Box::new(LocalReader { file, offset: 0 })
        } else if let SelectedInput::DrawThings { resource_id, .. } = selection {
            let bytes = tokio::select! {
                result = async {
                    resources.resolve(resource_id).await?.get_image(None).await?.context("Draw Things image is missing")
                } => result.context("failed to resolve Draw Things input")?,
                _ = cancellation.wait_for(|value| value.is_some()) => bail!("input staging cancelled"),
            };
            if bytes.len() as u64 > limits.max_file_bytes {
                bail!("input exceeds byte limit");
            }
            Box::new(std::io::Cursor::new(bytes))
        } else {
            bail!("missing input source");
        };
        let path = staged.directory.path().join(&name);
        let cancel = cancellation.clone();
        let remaining = limits
            .max_total_bytes
            .saturating_sub(total)
            .min(limits.max_file_bytes);
        // Move directory ownership into the worker so dropping the async caller cannot leak a partial copy.
        let (returned, input) = tokio::task::spawn_blocking(move || -> Result<_> {
            let mut reader = reader;
            let mut writer = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .context("failed to create staged input")?;
            let (byte_length, content_hash) =
                copy_checked(&mut reader, &mut writer, remaining, &cancel)?;
            drop(writer);
            let media_type = validate_image(&path, limits)?;
            check_cancelled(&cancel)?;
            Ok((
                staged,
                MaterializedInput {
                    input_id: id,
                    file_name: name,
                    media_type,
                    byte_length,
                    content_hash,
                },
            ))
        })
        .await
        .context("input staging worker failed")??;
        staged = returned;
        total += input.byte_length;
        staged.inputs.push(input);
    }
    Ok(staged)
}

pub(super) fn selection_token() -> Result<String> {
    let mut random = [0u8; 32];
    #[cfg(unix)]
    {
        // SAFETY: getentropy writes at most the supplied buffer length (below its 256-byte cap).
        if unsafe { libc::getentropy(random.as_mut_ptr().cast(), random.len()) } != 0 {
            return Err(std::io::Error::last_os_error())
                .context("failed to generate input approval token");
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        unsafe extern "system" {
            fn BCryptGenRandom(
                algorithm: *mut std::ffi::c_void,
                buffer: *mut u8,
                length: u32,
                flags: u32,
            ) -> i32;
        }
        // SAFETY: system-preferred RNG requires a null algorithm; the buffer has length 32.
        if unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                random.as_mut_ptr(),
                random.len() as u32,
                2,
            )
        } < 0
        {
            bail!("failed to generate input approval token");
        }
    }
    #[cfg(not(any(unix, windows)))]
    bail!("input approval tokens are unsupported on this platform");
    Ok(hex::encode(random))
}

fn check_cancelled(cancellation: &watch::Receiver<Option<CancellationReason>>) -> Result<()> {
    if cancellation.borrow().is_some() {
        bail!("input staging cancelled");
    }
    Ok(())
}
fn copy_checked(
    reader: &mut dyn Read,
    writer: &mut dyn Write,
    maximum: u64,
    cancellation: &watch::Receiver<Option<CancellationReason>>,
) -> Result<(u64, String)> {
    let mut buffer = [0u8; 64 * 1024];
    let mut length = 0u64;
    let mut hash = Sha256::new();
    loop {
        check_cancelled(cancellation)?;
        let count = reader
            .read(&mut buffer)
            .context("failed to read input bytes")?;
        if count == 0 {
            break;
        }
        length = length
            .checked_add(count as u64)
            .context("input length overflow")?;
        if length > maximum {
            bail!("input exceeds byte limit");
        }
        writer
            .write_all(&buffer[..count])
            .context("failed to write staged input")?;
        hash.update(&buffer[..count]);
    }
    writer.flush().context("failed to flush staged input")?;
    check_cancelled(cancellation)?;
    Ok((length, hex::encode(hash.finalize())))
}

/// Content detection and bounded decoding for PNG/JPEG. Decode is needed to reject corrupt payloads;
/// no decoded image is retained. Limits apply to dimensions and decoder allocation.
pub fn validate_image(path: &Path, limits: InputLimits) -> Result<String> {
    let mut reader =
        image::ImageReader::new(BufReader::new(File::open(path)?)).with_guessed_format()?;
    let media = match reader.format() {
        Some(image::ImageFormat::Png) => "image/png",
        Some(image::ImageFormat::Jpeg) => "image/jpeg",
        _ => bail!("unsupported input image format"),
    };
    let mut decode_limits = image::Limits::default();
    decode_limits.max_image_width = Some(limits.max_dimension);
    decode_limits.max_image_height = Some(limits.max_dimension);
    decode_limits.max_alloc = Some(limits.max_decode_bytes);
    reader.limits(decode_limits);
    reader
        .decode()
        .context("invalid or over-limit input image")?;
    Ok(media.into())
}

struct LocalReader {
    file: Arc<File>,
    offset: u64,
}
impl Read for LocalReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        #[cfg(unix)]
        let count = {
            use std::os::unix::fs::FileExt;
            self.file.read_at(buffer, self.offset)?
        };
        #[cfg(windows)]
        let count = {
            use std::os::windows::fs::FileExt;
            self.file.seek_read(buffer, self.offset)?
        };
        self.offset += count as u64;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{
        bun::BunExecutor,
        bun_probe::prepared_sidecar_path,
        executor::{ExecutionRequest, ExecutionTerminal, ScriptExecutor},
        types::*,
    };
    use std::{collections::BTreeMap, fs, io::Cursor};

    struct Resources {
        bytes: Option<Vec<u8>>,
    }
    #[async_trait]
    impl InputResources for Resources {
        async fn resolve(&self, id: &str) -> Result<Arc<dyn crate::ResourceHandle>> {
            if id != "resource" {
                bail!("unknown resource");
            }
            Ok(Arc::new(Resources {
                bytes: self.bytes.clone(),
            }))
        }
    }
    #[async_trait]
    impl crate::ResourceHandle for Resources {
        async fn get_tensor(&self) -> Result<Option<crate::Tensor>> {
            Ok(None)
        }
        async fn get_image(&self, _: Option<u32>) -> Result<Option<Vec<u8>>> {
            Ok(self.bytes.clone())
        }
        async fn get_preview(&self, _: bool) -> Result<Option<Vec<u8>>> {
            Ok(None)
        }
        async fn get_audio(&self) -> Result<Option<Vec<u8>>> {
            Ok(None)
        }
        async fn get_frames(
            &self,
            _: bool,
        ) -> Result<Option<Vec<Box<dyn crate::ResourceHandle + Send + Sync>>>> {
            Ok(None)
        }
        async fn get_dtm_path(&self) -> Result<Option<String>> {
            Ok(None)
        }
    }
    fn image(format: image::ImageFormat, value: u8) -> Vec<u8> {
        let image = image::RgbImage::from_pixel(2, 2, image::Rgb([value, 2, 3]));
        let mut out = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut out, format)
            .unwrap();
        out.into_inner()
    }
    fn local(approvals: &InputApprovals, path: &Path, id: &str, name: &str) -> SelectedInput {
        SelectedInput::LocalFile {
            input_id: id.into(),
            display_name: name.into(),
            selection_token: approvals
                .approve_local(path, Duration::from_secs(60))
                .unwrap(),
        }
    }
    fn resource(id: &str, name: &str) -> SelectedInput {
        SelectedInput::DrawThings {
            input_id: id.into(),
            display_name: name.into(),
            resource_id: "resource".into(),
        }
    }
    fn request(root: &Path, inputs: Vec<MaterializedInput>) -> ExecutionRequest {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/script/contracts/fixtures/contracts.json"
        ))
        .unwrap();
        let mut manifest: RunManifest =
            serde_json::from_value(fixture["runManifest"].clone()).unwrap();
        manifest.identity.run_id = RunId("input-test".into());
        manifest.source.instrumented_source =
            "createImageProcess(async (dtm) => await dtm.__input('image'))".into();
        manifest.source.source_map = None;
        manifest.values = BTreeMap::new();
        manifest.inputs = inputs;
        ExecutionRequest {
            runs_root: root.into(),
            manifest,
            timeout: Duration::from_secs(5),
        }
    }
    fn executor() -> BunExecutor {
        let target = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => "aarch64-apple-darwin",
            ("macos", "x86_64") => "x86_64-apple-darwin",
            ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
            ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
            _ => panic!("unsupported Bun target"),
        };
        BunExecutor::new(prepared_sidecar_path(target))
    }

    #[tokio::test]
    async fn local_and_resource_contracts_match_for_png_and_jpeg() {
        let root = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let (_tx, rx) = watch::channel(None);
        for (format, media) in [
            (image::ImageFormat::Png, "image/png"),
            (image::ImageFormat::Jpeg, "image/jpeg"),
        ] {
            let bytes = image(format, 1);
            let original = root.path().join("misleading.txt");
            fs::write(&original, &bytes).unwrap();
            let resources = Resources {
                bytes: Some(bytes.clone()),
            };
            let a = stage_inputs(
                stage.path(),
                &[local(&approvals, &original, "image", "image.dat")],
                &approvals,
                &resources,
                InputLimits::default(),
                rx.clone(),
            )
            .await
            .unwrap();
            let b = stage_inputs(
                stage.path(),
                &[resource("image", "image.dat")],
                &approvals,
                &resources,
                InputLimits::default(),
                rx.clone(),
            )
            .await
            .unwrap();
            assert_eq!(a.inputs(), b.inputs());
            assert_eq!(a.inputs()[0].media_type, media);
            assert_eq!(
                a.inputs()[0].content_hash,
                hex::encode(Sha256::digest(&bytes))
            );
            assert_eq!(a.inputs()[0].byte_length, bytes.len() as u64);
        }
        assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn changed_original_is_copied_once_then_prepared_transferred_and_executed() {
        let originals = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let runs = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let path = originals.path().join("original.png");
        fs::write(&path, image(image::ImageFormat::Png, 1)).unwrap();
        let selection = local(&approvals, &path, "image", "image.png");
        let copied = image(image::ImageFormat::Png, 2);
        fs::write(&path, &copied).unwrap();
        let (_tx, rx) = watch::channel(None);
        let resources = Resources {
            bytes: Some(image(image::ImageFormat::Png, 5)),
        };
        let staged = stage_inputs(
            stage.path(),
            &[selection, resource("second", "second.png")],
            &approvals,
            &resources,
            InputLimits::default(),
            rx.clone(),
        )
        .await
        .unwrap();
        assert_eq!(
            staged.inputs()[0].content_hash,
            hex::encode(Sha256::digest(&copied))
        );
        let later = image(image::ImageFormat::Png, 3);
        fs::write(&path, &later).unwrap();
        let executor = executor();
        let prepared = executor
            .prepare(request(runs.path(), staged.inputs().to_vec()))
            .await
            .unwrap();
        let prepared = staged.transfer(prepared, rx.clone()).await.unwrap();
        assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
        let staged_path = prepared.staged_input_path("image").unwrap();
        let second_path = prepared.staged_input_path("second").unwrap();
        assert_ne!(staged_path, second_path);
        assert_eq!(fs::read(&staged_path).unwrap(), copied);
        let result = executor.execute_prepared(prepared, rx).await.unwrap();
        let ExecutionTerminal::Succeeded(output) = result.terminal else {
            panic!("expected success: {:?}", result.terminal)
        };
        assert_eq!(fs::read(output.path).unwrap(), copied);
        fs::write(&staged_path, [0]).unwrap();
        assert_eq!(fs::read(&path).unwrap(), later);
        assert_eq!(fs::read(second_path).unwrap(), resources.bytes.unwrap());
    }

    #[tokio::test]
    async fn rejects_duplicate_ids_and_unapproved_or_expired_selections() {
        let root = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let path = root.path().join("a.png");
        fs::write(&path, image(image::ImageFormat::Png, 1)).unwrap();
        let selected = local(&approvals, &path, "a", "a.png");
        let resources = Resources {
            bytes: Some(image(image::ImageFormat::Png, 1)),
        };
        let (_tx, rx) = watch::channel(None);
        let expired = approvals.approve_local(&path, Duration::ZERO).unwrap();
        let mut cases = vec![
            vec![selected.clone(), selected.clone()],
            vec![resource("", "a.png")],
        ];
        for token in [path.display().to_string(), "../a".into(), expired] {
            cases.push(vec![SelectedInput::LocalFile {
                input_id: "a".into(),
                display_name: "a.png".into(),
                selection_token: token,
            }]);
        }
        for case in cases {
            assert!(stage_inputs(
                stage.path(),
                &case,
                &approvals,
                &resources,
                InputLimits::default(),
                rx.clone()
            )
            .await
            .is_err());
            assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
        }
        let SelectedInput::LocalFile {
            selection_token, ..
        } = selected
        else {
            unreachable!()
        };
        assert_eq!(selection_token.len(), 64);
        assert!(!selection_token.contains("a.png"));
        approvals.revoke(&selection_token).unwrap();
        assert!(approvals.resolve(&selection_token).is_err());
        assert!(approvals
            .approve_local(&root.path().join("missing"), Duration::from_secs(1))
            .is_err());
        assert!(approvals
            .approve_local(root.path(), Duration::from_secs(1))
            .is_err());
    }

    #[tokio::test]
    async fn shared_sources_and_labels_get_isolated_backend_paths() {
        let root = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let path = root.path().join("same.png");
        let other = root.path().join("nested");
        fs::create_dir(&other).unwrap();
        let other_path = other.join("same.png");
        let bytes = image(image::ImageFormat::Png, 1);
        fs::write(&path, &bytes).unwrap();
        fs::write(&other_path, image(image::ImageFormat::Png, 2)).unwrap();
        let resources = Resources {
            bytes: Some(bytes.clone()),
        };
        let (_tx, rx) = watch::channel(None);
        let selections = [
            local(&approvals, &path, "../opaque", "same.png"),
            local(&approvals, &path, "second", "same.png"),
            local(&approvals, &other_path, "third", "same.png"),
            resource("fourth", "a label/with spaces"),
            resource("fifth", "../label"),
        ];
        let staged = stage_inputs(
            stage.path(),
            &selections,
            &approvals,
            &resources,
            InputLimits::default(),
            rx,
        )
        .await
        .unwrap();
        let names: HashSet<_> = staged
            .inputs()
            .iter()
            .map(|input| &input.file_name)
            .collect();
        assert_eq!(names.len(), 5);
        assert_eq!(
            staged.inputs()[0].content_hash,
            staged.inputs()[1].content_hash
        );
        assert_eq!(
            staged.inputs()[3].content_hash,
            staged.inputs()[4].content_hash
        );
        for input in staged.inputs() {
            assert_eq!(Path::new(&input.file_name).components().count(), 1);
            assert!(staged.directory.path().join(&input.file_name).is_file());
        }
    }

    #[tokio::test]
    async fn missing_invalid_oversized_or_cancelled_inputs_cleanup_all_copies() {
        let root = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let bytes = image(image::ImageFormat::Png, 1);
        let path = root.path().join("valid");
        fs::write(&path, &bytes).unwrap();
        let (tx, rx) = watch::channel(None);
        let defaults = InputLimits::default();
        for (data, limits) in [
            (None, defaults),
            (Some(vec![0; 50]), defaults),
            (Some(bytes[..bytes.len() / 2].to_vec()), defaults),
            (
                Some(bytes.clone()),
                InputLimits {
                    max_file_bytes: 1,
                    ..defaults
                },
            ),
            (
                Some(bytes.clone()),
                InputLimits {
                    max_total_bytes: bytes.len() as u64,
                    ..defaults
                },
            ),
            (
                Some(bytes.clone()),
                InputLimits {
                    max_dimension: 1,
                    ..defaults
                },
            ),
            (
                Some(bytes.clone()),
                InputLimits {
                    max_decode_bytes: 1,
                    ..defaults
                },
            ),
            (
                Some(bytes.clone()),
                InputLimits {
                    max_inputs: 1,
                    ..defaults
                },
            ),
        ] {
            let resources = Resources { bytes: data };
            let selections = [
                local(&approvals, &path, "first", "first.png"),
                resource("second", "second.png"),
            ];
            assert!(stage_inputs(
                stage.path(),
                &selections,
                &approvals,
                &resources,
                limits,
                rx.clone()
            )
            .await
            .is_err());
            assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
        }
        tx.send(Some(CancellationReason::User)).unwrap();
        assert!(stage_inputs(
            stage.path(),
            &[],
            &approvals,
            &Resources { bytes: None },
            defaults,
            rx
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn cancellation_during_resource_resolution_cleans_prior_copies() {
        struct WaitingResources(tokio::sync::Notify);
        #[async_trait]
        impl InputResources for WaitingResources {
            async fn resolve(&self, _: &str) -> Result<Arc<dyn crate::ResourceHandle>> {
                self.0.notify_one();
                std::future::pending().await
            }
        }
        let root = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let path = root.path().join("original");
        fs::write(&path, image(image::ImageFormat::Png, 1)).unwrap();
        let selections = [
            local(&approvals, &path, "first", "first.png"),
            resource("second", "second.png"),
        ];
        let resources = WaitingResources(tokio::sync::Notify::new());
        let (tx, rx) = watch::channel(None);
        let staging = stage_inputs(
            stage.path(),
            &selections,
            &approvals,
            &resources,
            InputLimits::default(),
            rx,
        );
        tokio::pin!(staging);
        tokio::select! {
            result = &mut staging => panic!("unexpected staging completion: {}", result.is_ok()),
            _ = resources.0.notified() => {},
        }
        let private_directory = fs::read_dir(stage.path())
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(private_directory.join("input-0.image").is_file());
        tx.send(Some(CancellationReason::User)).unwrap();
        assert!(staging.await.is_err());
        assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
    }

    #[test]
    fn cancellation_and_read_failure_stop_after_partial_copy() {
        struct InterruptReader {
            tx: watch::Sender<Option<CancellationReason>>,
            cancel: bool,
            reads: usize,
        }
        impl Read for InterruptReader {
            fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
                self.reads += 1;
                if self.reads > 1 {
                    return Err(std::io::Error::other("injected read failure"));
                }
                buffer[..4].copy_from_slice(&[1; 4]);
                if self.cancel {
                    self.tx.send(Some(CancellationReason::User)).unwrap();
                }
                Ok(4)
            }
        }
        for cancel in [true, false] {
            let (tx, rx) = watch::channel(None);
            let mut reader = InterruptReader {
                tx,
                cancel,
                reads: 0,
            };
            let mut copied = Vec::new();
            assert!(copy_checked(&mut reader, &mut copied, 100, &rx).is_err());
            assert_eq!(copied, [1; 4]);
        }
    }

    #[tokio::test]
    async fn transfer_failure_or_cancellation_drops_prepared_and_staging() {
        let stage = tempfile::tempdir().unwrap();
        let runs = tempfile::tempdir().unwrap();
        let approvals = InputApprovals::default();
        let resources = Resources {
            bytes: Some(image(image::ImageFormat::Png, 1)),
        };
        for cancelled in [false, true] {
            let (tx, rx) = watch::channel(None);
            let staged = stage_inputs(
                stage.path(),
                &[resource("image", "image.png")],
                &approvals,
                &resources,
                InputLimits::default(),
                rx.clone(),
            )
            .await
            .unwrap();
            let prepared = executor()
                .prepare(request(runs.path(), staged.inputs().to_vec()))
                .await
                .unwrap();
            if cancelled {
                tx.send(Some(CancellationReason::User)).unwrap();
            } else {
                fs::write(
                    prepared.staged_input_path("image").unwrap(),
                    "already present",
                )
                .unwrap();
            }
            assert!(staged.transfer(prepared, rx).await.is_err());
            assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
            assert_eq!(fs::read_dir(runs.path()).unwrap().count(), 0);
        }
    }
}
