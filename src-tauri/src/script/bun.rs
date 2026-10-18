use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::sync::watch;

use super::bun_probe::validate_version;
use super::executor::*;
use super::types::{CancellationReason, RUN_MANIFEST_SCHEMA_VERSION};

const RUNNER: &str = include_str!("runtime/runner.ts");
const LOG_LIMIT: usize = EXECUTION_LOG_LIMIT;
const RESULT_LIMIT: u64 = 64 * 1024;
const TERMINATION_GRACE: Duration = Duration::from_millis(250);

pub struct BunExecutor {
    bun: PathBuf,
}

impl BunExecutor {
    pub fn new(bun: PathBuf) -> Self {
        Self { bun }
    }

    fn prepare_run(&self, request: ExecutionRequest) -> Result<PreparedExecution> {
        if request.manifest.schema_version != RUN_MANIFEST_SCHEMA_VERSION {
            bail!(
                "unsupported run manifest schema {}",
                request.manifest.schema_version
            );
        }
        let run_id = Path::new(&request.manifest.identity.run_id.0);
        if !matches!(
            run_id.components().collect::<Vec<_>>().as_slice(),
            [Component::Normal(_)]
        ) {
            bail!("run ID must be one relative path component");
        }
        let root = request.runs_root.canonicalize().with_context(|| {
            format!(
                "failed to canonicalize runs root {}",
                request.runs_root.display()
            )
        })?;
        let run = root.join(run_id);
        std::fs::create_dir(&run).with_context(|| {
            format!("failed to create immutable run directory {}", run.display())
        })?;
        let mut cleanup = PreparationCleanup(Some(run.clone()));
        let manifest = run.join("manifest.json");
        let entry = run.join("process.ts");
        let runner = run.join("runner.ts");
        write_new(&manifest, &serde_json::to_vec_pretty(&request.manifest)?)?;
        write_new(
            &entry,
            request.manifest.source.instrumented_source.as_bytes(),
        )?;
        write_new(&runner, RUNNER.as_bytes())?;
        if let Some(map) = &request.manifest.source.source_map {
            write_new(&run.join("process.ts.map"), map.as_bytes())?;
        }
        std::fs::create_dir(run.join("inputs"))
            .context("failed to create prepared input staging directory")?;
        make_readonly(&manifest)?;
        make_readonly(&entry)?;
        make_readonly(&runner)?;
        cleanup.0 = None;
        Ok(PreparedExecution {
            request,
            run_directory: run,
            prepared_by: PreparedBy::Bun(self.bun.clone()),
            cleanup_on_drop: true,
        })
    }

    fn validate_staged_inputs(prepared: &PreparedExecution) -> Result<()> {
        let manifest_path = prepared.run_directory.join("manifest.json");
        let persisted_manifest: super::types::RunManifest = serde_json::from_slice(
            &std::fs::read(&manifest_path)
                .with_context(|| format!("failed to verify {}", manifest_path.display()))?,
        )
        .context("prepared run manifest no longer matches its schema")?;
        if persisted_manifest != prepared.request.manifest {
            bail!("prepared run manifest changed before execution");
        }
        let entry_path = prepared.run_directory.join("process.ts");
        if std::fs::read(&entry_path)
            .with_context(|| format!("failed to verify {}", entry_path.display()))?
            != prepared
                .request
                .manifest
                .source
                .instrumented_source
                .as_bytes()
        {
            bail!("prepared instrumented source changed before execution");
        }
        let runner_path = prepared.run_directory.join("runner.ts");
        if std::fs::read(&runner_path)
            .with_context(|| format!("failed to verify {}", runner_path.display()))?
            != RUNNER.as_bytes()
        {
            bail!("prepared runtime changed before execution");
        }
        let source_map_path = prepared.run_directory.join("process.ts.map");
        match &prepared.request.manifest.source.source_map {
            Some(expected)
                if std::fs::read(&source_map_path).with_context(|| {
                    format!("failed to verify {}", source_map_path.display())
                })? != expected.as_bytes() =>
            {
                bail!("prepared source map changed before execution");
            }
            None if source_map_path.exists() => {
                bail!("unexpected source map appeared before execution");
            }
            _ => {}
        }
        let inputs_directory = prepared.run_directory.join("inputs");
        if !std::fs::symlink_metadata(&inputs_directory)
            .context("prepared input staging directory is missing")?
            .file_type()
            .is_dir()
        {
            bail!("prepared input staging path is not a directory");
        }
        for input in &prepared.request.manifest.inputs {
            let path = prepared.staged_input_path(&input.input_id)?;
            let metadata = std::fs::symlink_metadata(&path)
                .with_context(|| format!("staged input is missing: {}", path.display()))?;
            if !metadata.file_type().is_file() {
                bail!("staged input is not a regular file: {}", path.display());
            }
            if metadata.len() != input.byte_length {
                bail!(
                    "staged input size mismatch for {:?}: expected {}, got {}",
                    input.input_id,
                    input.byte_length,
                    metadata.len()
                );
            }
        }
        Ok(())
    }
}

struct PreparationCleanup(Option<PathBuf>);
impl Drop for PreparationCleanup {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = std::fs::remove_dir_all(path);
        }
    }
}

fn write_new(path: &Path, contents: &[u8]) -> Result<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    file.write_all(contents)
        .with_context(|| format!("failed to write {}", path.display()))?;
    file.sync_all()
        .with_context(|| format!("failed to sync {}", path.display()))
}
fn make_readonly(path: &Path) -> Result<()> {
    let mut p = std::fs::metadata(path)?.permissions();
    p.set_readonly(true);
    std::fs::set_permissions(path, p)?;
    Ok(())
}
#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", deny_unknown_fields)]
enum ResultManifest {
    Success { output: ResultOutput },
    Failure { failure: ExecutionFailure },
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResultOutput {
    path: PathBuf,
    media_type: String,
}

fn read_result(path: &Path) -> Result<ExecutionTerminal> {
    use std::io::Read;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // O_NONBLOCK prevents an attacker-controlled FIFO from hanging open before we can reject
        // it with the regular-file check below. It has no effect on ordinary files.
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options
        .open(path)
        .with_context(|| format!("runner did not produce result manifest {}", path.display()))?;
    let metadata = file
        .metadata()
        .context("failed to inspect result manifest")?;
    if !metadata.is_file() {
        bail!("result manifest is not a regular file");
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(RESULT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .context("failed to read result manifest")?;
    if bytes.len() as u64 > RESULT_LIMIT {
        bail!("result manifest exceeds {RESULT_LIMIT} bytes");
    }
    if bytes.is_empty() {
        bail!("result manifest is empty");
    }
    match serde_json::from_slice(&bytes).context("result manifest is malformed")? {
        ResultManifest::Success { output } => Ok(ExecutionTerminal::Succeeded(ExecutionOutput {
            path: output.path,
            media_type: output.media_type,
        })),
        ResultManifest::Failure { failure } => {
            if failure
                .location
                .as_ref()
                .is_some_and(|location| location.line == 0 || location.column == 0)
            {
                bail!("result location must use positive one-based coordinates");
            }
            Ok(ExecutionTerminal::Failed(failure))
        }
    }
}

async fn capture<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
    stream: ExecutionLogStream,
    identity: super::types::RunIdentity,
    observer: ExecutionObserver,
) -> Result<ExecutionLog> {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 8192];
    let mut truncated = false;
    let mut pending_utf8 = Vec::new();
    loop {
        let count = reader.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        let remaining = LOG_LIMIT.saturating_sub(bytes.len());
        let accepted = &chunk[..count.min(remaining)];
        bytes.extend_from_slice(accepted);
        pending_utf8.extend_from_slice(accepted);
        let text = decode_log_delta(&mut pending_utf8, false);
        let newly_truncated = !truncated && count > remaining;
        truncated |= count > remaining;
        if !text.is_empty() || newly_truncated {
            observer.emit(
                &identity,
                ExecutionEventKind::Log(ExecutionLog {
                    stream,
                    text,
                    truncated,
                }),
            );
        }
    }
    let tail = decode_log_delta(&mut pending_utf8, true);
    if !tail.is_empty() {
        observer.emit(
            &identity,
            ExecutionEventKind::Log(ExecutionLog {
                stream,
                text: tail,
                truncated,
            }),
        );
    }
    Ok(ExecutionLog {
        stream,
        text: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    })
}

/// Decode complete UTF-8 sequences, retaining at most three trailing bytes between reads.
fn decode_log_delta(pending: &mut Vec<u8>, eof: bool) -> String {
    let mut text = String::new();
    let mut consumed = 0;
    while consumed < pending.len() {
        match std::str::from_utf8(&pending[consumed..]) {
            Ok(valid) => {
                text.push_str(valid);
                consumed = pending.len();
            }
            Err(error) => {
                let valid_end = consumed + error.valid_up_to();
                // The checked prefix is valid UTF-8.
                text.push_str(
                    std::str::from_utf8(&pending[consumed..valid_end]).unwrap_or_default(),
                );
                consumed = valid_end;
                if let Some(length) = error.error_len() {
                    text.push('\u{fffd}');
                    consumed += length;
                } else if eof {
                    text.push('\u{fffd}');
                    consumed = pending.len();
                } else {
                    break;
                }
            }
        }
    }
    pending.drain(..consumed);
    text
}

#[cfg(unix)]
fn configure_group(command: &mut Command) {
    std::os::unix::process::CommandExt::process_group(command.as_std_mut(), 0);
}
#[cfg(not(unix))]
fn configure_group(_: &mut Command) {}
#[cfg(unix)]
fn signal_group(pid: u32, signal: libc::c_int) -> Result<()> {
    let pid = i32::try_from(pid)?;
    if unsafe { libc::kill(-pid, signal) } == 0 {
        return Ok(());
    }
    let e = std::io::Error::last_os_error();
    if e.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(e.into())
    }
}
async fn terminate(child: &mut ChildGuard) -> Result<()> {
    #[cfg(unix)]
    {
        let process = child.0.as_mut().context("Bun process was already reaped")?;
        let pid = process.id().context("Bun had no process ID")?;
        signal_group(pid, libc::SIGTERM)?;
        let leader_reaped = match tokio::time::timeout(TERMINATION_GRACE, process.wait()).await {
            Ok(status) => {
                status.context("failed waiting for terminated Bun")?;
                true
            }
            Err(_) => false,
        };
        // The leader can exit on TERM while a descendant ignores it. Always address the group.
        signal_group(pid, libc::SIGKILL)?;
        if !leader_reaped {
            process
                .wait()
                .await
                .context("failed waiting for killed Bun")?;
        }
        child.0.take();
    }
    #[cfg(not(unix))]
    {
        let process = child.0.as_mut().context("Bun process was already reaped")?;
        process.kill().await?;
        process.wait().await?;
        child.0.take();
    }
    Ok(())
}

struct ChildGuard(Option<Child>);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            #[cfg(unix)]
            if let Some(pid) = child.id() {
                let _ = signal_group(pid, libc::SIGKILL);
            }
            let _ = child.start_kill();
        }
    }
}

#[async_trait]
impl ScriptExecutor for BunExecutor {
    async fn prepare(&self, request: ExecutionRequest) -> Result<PreparedExecution> {
        self.prepare_run(request)
    }

    async fn execute_prepared_observed(
        &self,
        mut prepared: PreparedExecution,
        mut cancellation: watch::Receiver<Option<CancellationReason>>,
        observer: ExecutionObserver,
    ) -> Result<ExecutionResult> {
        if prepared.prepared_by != PreparedBy::Bun(self.bun.clone()) {
            bail!("prepared execution belongs to a different executor");
        }
        if let Some(reason) = cancellation.borrow().clone() {
            return Ok(ExecutionResult {
                terminal: ExecutionTerminal::Cancelled(reason),
                logs: Vec::new(),
            });
        }
        validate_version(&self.bun).await?;
        Self::validate_staged_inputs(&prepared)?;
        if let Some(reason) = cancellation.borrow().clone() {
            return Ok(ExecutionResult {
                terminal: ExecutionTerminal::Cancelled(reason),
                logs: Vec::new(),
            });
        }
        let run_directory = prepared.run_directory.clone();
        let manifest = run_directory.join("manifest.json");
        let entry = run_directory.join("process.ts");
        let runner = run_directory.join("runner.ts");
        let result_path = run_directory.join("result.json");
        let timeout = prepared.request.timeout;
        let mut command = Command::new(&self.bun);
        command
            .arg("--no-install")
            .args([
                runner.as_os_str(),
                manifest.as_os_str(),
                entry.as_os_str(),
                result_path.as_os_str(),
            ])
            .current_dir(&run_directory)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_clear();
        configure_group(&mut command);
        let child = command
            .spawn()
            .with_context(|| format!("failed to start pinned Bun at {}", self.bun.display()))?;
        // The caller's run-root lifecycle owns completed/started runs. Before spawn, dropping the
        // opaque preparation cleans partial staging automatically.
        prepared.cleanup_on_drop = false;
        let process_id = child.id().context("Bun had no process ID")?;
        let mut child = ChildGuard(Some(child));
        let identity = prepared.manifest().identity.clone();
        observer.emit(
            &identity,
            ExecutionEventKind::Started {
                process_id: Some(process_id),
            },
        );
        let stdout = tokio::spawn(capture(
            child
                .0
                .as_mut()
                .unwrap()
                .stdout
                .take()
                .context("Bun stdout unavailable")?,
            ExecutionLogStream::Stdout,
            identity.clone(),
            observer.clone(),
        ));
        let stderr = tokio::spawn(capture(
            child
                .0
                .as_mut()
                .unwrap()
                .stderr
                .take()
                .context("Bun stderr unavailable")?,
            ExecutionLogStream::Stderr,
            identity,
            observer,
        ));
        let terminal = tokio::select! {
          status = child.0.as_mut().unwrap().wait() => {
              let status = status.context("failed waiting for Bun")?;
              #[cfg(unix)] signal_group(process_id, libc::SIGKILL)?;
              child.0.take();
              match (status.success(), read_result(&result_path)) {
                  (true, Ok(terminal)) => terminal,
                  (false, Ok(ExecutionTerminal::Failed(failure))) => ExecutionTerminal::Failed(failure),
                  (_, Ok(_)) => ExecutionTerminal::Failed(ExecutionFailure::runner(format!("Bun exited unsuccessfully with {status}"))),
                  (_, Err(error)) => ExecutionTerminal::Failed(ExecutionFailure::runner(format!("{error:#} (Bun exited {status})"))),
              }
          },
          _=tokio::time::sleep(timeout)=>{terminate(&mut child).await?; ExecutionTerminal::TimedOut},
          changed=cancellation.changed()=>{ let reason = match changed { Ok(()) => cancellation.borrow().clone().unwrap_or(CancellationReason::Shutdown), Err(_) => CancellationReason::Shutdown }; terminate(&mut child).await?; ExecutionTerminal::Cancelled(reason)},
        };
        let logs = vec![
            stdout.await.context("stdout capture task failed")??,
            stderr.await.context("stderr capture task failed")??,
        ];
        Ok(ExecutionResult { terminal, logs })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::bun_probe::prepared_sidecar_path;
    use crate::script::types::*;
    use std::collections::BTreeMap;

    #[tokio::test]
    async fn existing_output_directory_can_contain_the_returned_image() {
        let (_root, result) = run(
            r#"import { mkdir } from 'node:fs/promises';
            createImageProcess(async () => {
              await mkdir('output');
              await Bun.write('output/user.png', Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0)));
              return 'output/user.png';
            })"#,
            "existing-output",
        ).await;
        let ExecutionTerminal::Succeeded(output) = result.terminal else {
            panic!("{result:?}")
        };
        assert!(std::fs::read(output.path)
            .unwrap()
            .starts_with(&[137, 80, 78, 71]));
    }

    #[tokio::test]
    async fn oversized_thrown_values_keep_a_bounded_structured_failure() {
        let (_root, result) = run(
            "createImageProcess(() => { throw '\\u0001'.repeat(100000) })",
            "large-error",
        )
        .await;
        let ExecutionTerminal::Failed(failure) = result.terminal else {
            panic!("{result:?}")
        };
        assert_eq!(failure.phase, ExecutionFailurePhase::UserRuntime);
        assert_eq!(failure.message.len(), 1024);
        assert!(result
            .logs
            .iter()
            .any(|log| log.stream == ExecutionLogStream::Stderr && log.truncated));
    }

    #[tokio::test]
    async fn failures_distinguish_import_runtime_and_runner_and_preserve_raw_stderr() {
        for (id, source, phase, message) in [
            (
                "syntax",
                "createImageProcess(() => { const = 1 })",
                ExecutionFailurePhase::Import,
                "Expected",
            ),
            (
                "import-error",
                "throw new Error('load failed')",
                ExecutionFailurePhase::Import,
                "load failed",
            ),
            (
                "runtime-error",
                "createImageProcess(() => {\nthrow new Error('callback failed')\n})",
                ExecutionFailurePhase::UserRuntime,
                "callback failed",
            ),
            (
                "normalize-error",
                "createImageProcess(() => null)",
                ExecutionFailurePhase::Runner,
                "process must return",
            ),
            (
                "missing-result",
                "createImageProcess(() => process.exit(0))",
                ExecutionFailurePhase::Runner,
                "did not produce result",
            ),
            (
                "non-string-stack",
                "createImageProcess(() => { const error = new Error('bad stack'); error.stack = 42; throw error; })",
                ExecutionFailurePhase::UserRuntime,
                "bad stack",
            ),
        ] {
            let (_root, result) = run(source, id).await;
            let ExecutionTerminal::Failed(failure) = result.terminal else {
                panic!("{result:?}")
            };
            assert_eq!(failure.phase, phase);
            assert!(failure.message.contains(message), "{failure:?}");
            if id == "syntax" {
                let location = failure.location.as_ref().unwrap();
                assert_eq!((location.line, location.column), (1, 34));
            }
            if id == "runtime-error" {
                let location = failure.location.unwrap();
                assert!(location.file.ends_with("process.ts"));
                assert_eq!(location.line, 2);
                assert!(location.column > 0);
                assert!(failure.stack.unwrap().contains("callback failed"));
            }
            if id != "missing-result" {
                assert!(
                    result
                        .logs
                        .iter()
                        .any(|log| log.stream == ExecutionLogStream::Stderr
                            && log.text.contains(message)),
                    "{:?}",
                    result.logs
                );
            }
        }
    }

    #[tokio::test]
    async fn started_and_logs_are_observed_before_completion_with_snapshot_identity() {
        let bun = prepared_bun().unwrap();
        let root = tempfile::tempdir().unwrap();
        let executor = BunExecutor::new(bun);
        let request = request(root.path(), "events", "createImageProcess(async () => { console.log('ready'); await new Promise(() => {}); })", Duration::from_secs(10));
        let identity = request.manifest.identity.clone();
        let prepared = executor.prepare(request).await.unwrap();
        let (events_tx, mut events) = tokio::sync::mpsc::unbounded_channel();
        let observer = ExecutionObserver::new(move |event| {
            let _ = events_tx.send(event);
        });
        let (cancel, rx) = watch::channel(None);
        let handle = tokio::spawn(async move {
            executor
                .execute_prepared_observed(prepared, rx, observer)
                .await
        });
        let event = tokio::time::timeout(Duration::from_secs(3), events.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(event.identity, identity);
        assert!(matches!(
            event.kind,
            ExecutionEventKind::Started {
                process_id: Some(_)
            }
        ));
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let event = events.recv().await.unwrap();
                assert_eq!(event.identity, identity);
                if matches!(event.kind, ExecutionEventKind::Log(ref log) if log.text.contains("ready")) { break; }
            }
        }).await.unwrap();
        assert!(!handle.is_finished());
        cancel.send(Some(CancellationReason::User)).unwrap();
        let result = handle.await.unwrap().unwrap();
        assert_eq!(
            result.terminal,
            ExecutionTerminal::Cancelled(CancellationReason::User)
        );
        assert!(result.logs.iter().any(|log| log.text.contains("ready")));
    }

    #[tokio::test]
    async fn cancelled_preparation_never_emits_started() {
        let root = tempfile::tempdir().unwrap();
        let executor = BunExecutor::new(prepared_bun().unwrap());
        let prepared = executor
            .prepare(request(
                root.path(),
                "pre-cancel",
                "",
                Duration::from_secs(1),
            ))
            .await
            .unwrap();
        let observer = ExecutionObserver::new(|_| panic!("cancelled run must not start"));
        let (tx, rx) = watch::channel(Some(CancellationReason::User));
        let result = executor
            .execute_prepared_observed(prepared, rx, observer)
            .await
            .unwrap();
        assert_eq!(
            result.terminal,
            ExecutionTerminal::Cancelled(CancellationReason::User)
        );
        assert!(!root.path().join("pre-cancel").exists());
        drop(tx);
    }

    #[tokio::test]
    async fn log_deltas_preserve_split_utf8_and_stop_emitting_after_the_cap() {
        struct Chunks(std::collections::VecDeque<Vec<u8>>);
        impl tokio::io::AsyncRead for Chunks {
            fn poll_read(
                mut self: std::pin::Pin<&mut Self>,
                _: &mut std::task::Context<'_>,
                buffer: &mut tokio::io::ReadBuf<'_>,
            ) -> std::task::Poll<std::io::Result<()>> {
                if let Some(mut bytes) = self.0.pop_front() {
                    let count = bytes.len().min(buffer.remaining());
                    buffer.put_slice(&bytes[..count]);
                    if count < bytes.len() {
                        self.0.push_front(bytes.split_off(count));
                    }
                }
                std::task::Poll::Ready(Ok(()))
            }
        }
        let reader = Chunks(
            [
                vec![0xf0, 0x9f],
                vec![0x98, 0x80, 0xff],
                vec![b'x'; LOG_LIMIT + 100],
                vec![b'y'; 100],
            ]
            .into(),
        );
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let observer = ExecutionObserver::new(move |event| {
            let _ = tx.send(event);
        });
        let root = tempfile::tempdir().unwrap();
        let identity = request(root.path(), "utf8", "", Duration::ZERO)
            .manifest
            .identity;
        let result = capture(reader, ExecutionLogStream::Stdout, identity, observer)
            .await
            .unwrap();
        let mut text = String::new();
        let mut count = 0;
        while let Ok(event) = rx.try_recv() {
            let ExecutionEventKind::Log(log) = event.kind else {
                panic!()
            };
            text.push_str(&log.text);
            count += 1;
        }
        assert_eq!(text, result.text);
        assert!(text.starts_with("😀�"));
        assert!(result.truncated);
        assert!(count < 20);
    }

    fn prepared_bun() -> Option<PathBuf> {
        if let Some(path) = option_env!("S13_BUN_PATH").map(PathBuf::from) {
            return path.is_file().then_some(path);
        }
        let target = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
            ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
            ("macos", "x86_64") => "x86_64-apple-darwin",
            ("macos", "aarch64") => "aarch64-apple-darwin",
            _ => return None,
        };
        let path = prepared_sidecar_path(target);
        path.is_file().then_some(path)
    }

    fn request(root: &Path, id: &str, source: &str, timeout: Duration) -> ExecutionRequest {
        ExecutionRequest {
            runs_root: root.to_path_buf(),
            timeout,
            manifest: RunManifest {
                schema_version: RUN_MANIFEST_SCHEMA_VERSION,
                identity: RunIdentity {
                    project_id: ProjectId("project".into()),
                    run_id: RunId(id.into()),
                    client_request_id: ClientRequestId("client".into()),
                    source_revision: SourceRevision(1),
                    value_revision: ValueRevision(1),
                    input_revision: InputRevision(1),
                },
                source: SourceSnapshot {
                    source_revision: SourceRevision(1),
                    content_hash: "test-hash".into(),
                    source: source.into(),
                    instrumented_source: source.into(),
                    source_map: None,
                },
                values: BTreeMap::new(),
                inputs: vec![],
            },
        }
    }

    async fn run(source: &str, id: &str) -> (tempfile::TempDir, ExecutionResult) {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (_tx, rx) = watch::channel(None);
        let result = BunExecutor::new(bun)
            .execute(request(root.path(), id, source, Duration::from_secs(5)), rx)
            .await
            .unwrap();
        (root, result)
    }
    #[test]
    fn rejects_missing_partial_oversized_and_malformed_results() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("result.json");
        assert!(read_result(&p).is_err());
        for failure in [
            r#"{"status":"failure","failure":{"phase":"unknown","message":"bad"}}"#,
            r#"{"status":"failure","failure":{"phase":"runner","message":"bad","location":{"file":"process.ts","line":0,"column":1}}}"#,
        ] {
            std::fs::write(&p, failure).unwrap();
            assert!(read_result(&p).is_err());
        }
        std::fs::write(&p, b"{\"status\":").unwrap();
        assert!(read_result(&p).is_err());
        std::fs::write(&p, vec![b'x'; RESULT_LIMIT as usize + 1]).unwrap();
        assert!(read_result(&p).is_err());
        std::fs::write(
            &p,
            b"{\"status\":\"success\",\"output\":{\"path\":3,\"mediaType\":\"image/png\"}}",
        )
        .unwrap();
        assert!(read_result(&p).is_err());
        #[cfg(unix)]
        {
            std::fs::remove_file(&p).unwrap();
            std::os::unix::fs::symlink("target", &p).unwrap();
            std::fs::write(d.path().join("target"), b"{}").unwrap();
            assert!(read_result(&p).is_err());

            let fifo = d.path().join("result.fifo");
            let fifo_path = std::ffi::CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(fifo_path.as_ptr(), 0o600) }, 0);
            let started = std::time::Instant::now();
            assert!(read_result(&fifo).is_err());
            assert!(started.elapsed() < Duration::from_secs(1));
        }
    }

    #[tokio::test]
    async fn zero_and_multiple_registrations_fail() {
        for (id, source) in [
            ("zero", "console.log('no registration')"),
            (
                "multiple",
                "createImageProcess(() => new Uint8Array()); createImageProcess(() => new Uint8Array())",
            ),
        ] {
            let (_root, result) = run(source, id).await;
            let ExecutionTerminal::Failed(message) = result.terminal else {
                panic!("expected registration failure")
            };
            assert!(message.message.contains("expected exactly one createImageProcess registration"));
        }
    }

    #[tokio::test]
    async fn stdout_cannot_forge_success_and_fixed_png_bytes_succeed() {
        let (_forged_root, forged) = run(
            "console.log(JSON.stringify({status:'success',output:{path:'/forged',mediaType:'image/png'}})); throw new Error('import failed')",
            "forged",
        ).await;
        assert!(
            matches!(forged.terminal, ExecutionTerminal::Failed(ref value) if value.message.contains("import failed"))
        );

        let (_png_root, png) = run(
            "createImageProcess(() => Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0)))",
            "png",
        )
        .await;
        let ExecutionTerminal::Succeeded(output) = png.terminal else {
            panic!("expected success")
        };
        let bytes = std::fs::read(output.path).unwrap();
        assert!(bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]));
        assert!(bytes.ends_with(&[73, 69, 78, 68, 174, 66, 96, 130]));
        assert_eq!(output.media_type, "image/png");
    }

    #[tokio::test]
    async fn timeout_and_explicit_cancellation_are_distinguishable() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (_tx, rx) = watch::channel(None);
        let timed_out = BunExecutor::new(bun.clone())
            .execute(
                request(
                    root.path(),
                    "timeout",
                    "createImageProcess(() => new Promise(() => {}))",
                    Duration::from_millis(50),
                ),
                rx,
            )
            .await
            .unwrap();
        assert_eq!(timed_out.terminal, ExecutionTerminal::TimedOut);

        let (tx, rx) = watch::channel(None);
        tx.send(Some(CancellationReason::User)).unwrap();
        let cancelled = BunExecutor::new(bun)
            .execute(
                request(
                    root.path(),
                    "cancel",
                    "createImageProcess(() => new Promise(() => {}))",
                    Duration::from_secs(5),
                ),
                rx,
            )
            .await
            .unwrap();
        assert_eq!(
            cancelled.terminal,
            ExecutionTerminal::Cancelled(CancellationReason::User)
        );
    }

    async fn wait_for_pid(path: &Path) -> Result<u32> {
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if let Ok(contents) = std::fs::read_to_string(path) {
                    if let Ok(pid) = contents.trim().parse() {
                        return pid;
                    }
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .context("timed out waiting for descendant pid")
    }

    async fn wait_for_file(path: &Path) -> Result<()> {
        tokio::time::timeout(Duration::from_secs(3), async {
            while !path.is_file() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .context("timed out waiting for readiness file")
    }

    #[cfg(unix)]
    fn process_is_running(pid: u32) -> bool {
        #[cfg(target_os = "linux")]
        {
            return std::fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|stat| {
                stat.split(") ")
                    .nth(1)
                    .is_some_and(|fields| !fields.starts_with('Z'))
            });
        }
        #[cfg(not(target_os = "linux"))]
        unsafe {
            libc::kill(pid as i32, 0) == 0
        }
    }

    #[cfg(unix)]
    async fn wait_for_stopped(pid: u32) -> Result<()> {
        tokio::time::timeout(Duration::from_secs(3), async {
            while process_is_running(pid) {
                tokio::task::yield_now().await;
            }
        })
        .await
        .context("timed out waiting for descendant termination")
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_force_kills_leader_and_child_process_group() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (tx, rx) = watch::channel(None);
        let executor = BunExecutor::new(bun);
        let request = request(
            root.path(),
            "group",
            r#"
            process.on("SIGTERM", () => {});
            createImageProcess(async () => {
              const child = Bun.spawn(["/bin/sh", "-c", "trap '' TERM; while :; do :; done"]);
              await Bun.write("child.pid", String(child.pid));
              console.log(`CHILD:${child.pid}`);
              await new Promise(() => {});
            })
        "#,
            Duration::from_secs(5),
        );
        let handle = tokio::spawn(async move { executor.execute(request, rx).await });
        // User code creates this readiness marker only after its descendant has started.
        let pid_path = root.path().join("group/child.pid");
        let pid = wait_for_pid(&pid_path).await.unwrap();
        tx.send(Some(CancellationReason::User)).unwrap();
        let result = handle.await.unwrap().unwrap();
        assert!(matches!(
            result.terminal,
            ExecutionTerminal::Cancelled(CancellationReason::User)
        ));
        wait_for_stopped(pid).await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn termination_kills_group_after_leader_exits_first() {
        let directory = tempfile::tempdir().unwrap();
        let pid_path = directory.path().join("child.pid");
        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            &format!(
                "trap '' TERM; while :; do :; done & echo $! > {}; exit 0",
                pid_path.display()
            ),
        ]);
        command.stdout(Stdio::null()).stderr(Stdio::null());
        configure_group(&mut command);
        let child = command.spawn().unwrap();
        let mut child = ChildGuard(Some(child));
        let pid = wait_for_pid(&pid_path).await.unwrap();
        terminate(&mut child).await.unwrap();
        wait_for_stopped(pid).await.unwrap();
    }

    #[tokio::test]
    async fn drains_logs_after_cap_without_breaking_user_output() {
        let (_root, result) = run(
            "createImageProcess(() => { console.log('x'.repeat(200000)); return Uint8Array.from([1]); })",
            "large-log",
        ).await;
        assert!(matches!(result.terminal, ExecutionTerminal::Succeeded(_)));
        assert!(result
            .logs
            .iter()
            .any(|log| log.truncated && log.text.len() == LOG_LIMIT));
    }

    #[tokio::test]
    async fn rejects_success_manifest_when_bun_exits_nonzero() {
        let (_root, result) = run(
            "createImageProcess(() => { process.exitCode = 7; return Uint8Array.from([1]); })",
            "nonzero",
        )
        .await;
        assert!(
            matches!(result.terminal, ExecutionTerminal::Failed(ref message) if message.message.contains("exited unsuccessfully"))
        );
    }

    #[tokio::test]
    async fn returned_paths_are_copied_into_run_output() {
        let (root, result) = run(
            "createImageProcess(async () => { await Bun.write('original.png', Uint8Array.from([1,2,3])); return 'original.png'; })",
            "copy-output",
        ).await;
        let ExecutionTerminal::Succeeded(output) = result.terminal else {
            panic!("expected success")
        };
        assert_eq!(
            output.path,
            root.path()
                .canonicalize()
                .unwrap()
                .join("copy-output/output/result.bin")
        );
        assert_eq!(std::fs::read(&output.path).unwrap(), [1, 2, 3]);
        assert_eq!(
            std::fs::read(root.path().join("copy-output/original.png")).unwrap(),
            [1, 2, 3]
        );
        std::fs::write(&output.path, [9]).unwrap();
        assert_eq!(
            std::fs::read(root.path().join("copy-output/original.png")).unwrap(),
            [1, 2, 3]
        );
    }

    #[tokio::test]
    async fn prepared_input_can_be_staged_before_spawn_and_is_copied_to_output() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let source = "createImageProcess(async (dtm) => await dtm.__input('image'))";
        let mut request = request(root.path(), "staged-input", source, Duration::from_secs(5));
        let png = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        )
        .unwrap();
        request.manifest.inputs.push(MaterializedInput {
            input_id: "image".into(),
            file_name: "image.png".into(),
            media_type: "image/png".into(),
            byte_length: png.len() as u64,
            content_hash: "fixture-hash".into(),
        });
        let expected_identity = request.manifest.identity.clone();
        let expected_source = request.manifest.source.clone();
        let executor = BunExecutor::new(bun);
        let prepared = executor.prepare(request).await.unwrap();
        assert_eq!(prepared.manifest().identity, expected_identity);
        assert_eq!(prepared.manifest().source, expected_source);
        let staged = prepared.staged_input_path("image").unwrap();
        std::fs::write(&staged, &png).unwrap();

        let (_tx, rx) = watch::channel(None);
        let result = executor.execute_prepared(prepared, rx).await.unwrap();
        let ExecutionTerminal::Succeeded(output) = result.terminal else {
            panic!("expected staged input success")
        };
        assert_ne!(output.path, staged);
        assert_eq!(std::fs::read(&output.path).unwrap(), png);
        std::fs::write(&output.path, [0]).unwrap();
        assert_eq!(std::fs::read(staged).unwrap(), png);
    }

    #[tokio::test]
    async fn sender_disappearance_cancels_as_shutdown() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (tx, rx) = watch::channel(None);
        drop(tx);
        let result = BunExecutor::new(bun)
            .execute(
                request(
                    root.path(),
                    "sender-drop",
                    "createImageProcess(() => new Promise(() => {}))",
                    Duration::from_secs(5),
                ),
                rx,
            )
            .await
            .unwrap();
        assert_eq!(
            result.terminal,
            ExecutionTerminal::Cancelled(CancellationReason::Shutdown)
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_execution_future_does_not_orphan_descendant() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (_tx, rx) = watch::channel(None);
        let executor = BunExecutor::new(bun);
        let request = request(
            root.path(),
            "drop",
            r#"
            createImageProcess(async () => {
              const child = Bun.spawn(["/bin/sh", "-c", "trap '' TERM; while :; do :; done"]);
              await Bun.write("child.pid", String(child.pid));
              await new Promise(() => {});
            })
        "#,
            Duration::from_secs(30),
        );
        let handle = tokio::spawn(async move { executor.execute(request, rx).await });
        let pid = wait_for_pid(&root.path().join("drop/child.pid"))
            .await
            .unwrap();
        handle.abort();
        let _ = handle.await;
        wait_for_stopped(pid).await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn abort_during_termination_grace_kills_leader_and_descendant() {
        let bun = prepared_bun().expect("prepare the pinned Bun with scripts/prepare-bun.sh host");
        let root = tempfile::tempdir().unwrap();
        let (tx, rx) = watch::channel(None);
        let executor = BunExecutor::new(bun);
        let request = request(
            root.path(),
            "abort-grace",
            r#"
            await Bun.write("leader.pid", String(process.pid));
            process.on("SIGTERM", async () => { await Bun.write("term-observed", "yes"); });
            createImageProcess(async () => {
              const child = Bun.spawn(["/bin/sh", "-c", "trap '' TERM; while :; do :; done"]);
              await Bun.write("child.pid", String(child.pid));
              await new Promise(() => {});
            })
        "#,
            Duration::from_secs(30),
        );
        let handle = tokio::spawn(async move { executor.execute(request, rx).await });
        let directory = root.path().join("abort-grace");
        let leader = wait_for_pid(&directory.join("leader.pid")).await.unwrap();
        let descendant = wait_for_pid(&directory.join("child.pid")).await.unwrap();
        tx.send(Some(CancellationReason::User)).unwrap();
        wait_for_file(&directory.join("term-observed"))
            .await
            .unwrap();
        handle.abort();
        let _ = handle.await;
        wait_for_stopped(leader).await.unwrap();
        wait_for_stopped(descendant).await.unwrap();
    }

    #[test]
    fn rejects_unsafe_run_ids_and_existing_run_directories() {
        let root = tempfile::tempdir().unwrap();
        let executor = BunExecutor::new(PathBuf::from("bun"));
        for id in ["../escape", "/absolute", "two/parts", "."] {
            assert!(executor
                .prepare_run(request(root.path(), id, "", Duration::ZERO))
                .is_err());
        }
        let bad = request(root.path(), "partial", "", Duration::ZERO);
        std::fs::create_dir(root.path().join("partial")).unwrap();
        std::fs::write(root.path().join("partial/manifest.json"), "occupied").unwrap();
        assert!(executor.prepare_run(bad).is_err());

        let abandoned = root.path().join("abandoned");
        std::fs::create_dir(&abandoned).unwrap();
        std::fs::write(abandoned.join("partial"), "data").unwrap();
        drop(PreparationCleanup(Some(abandoned.clone())));
        assert!(!abandoned.exists());
    }
}
