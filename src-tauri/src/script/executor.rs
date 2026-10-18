use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tokio::sync::watch;

use super::types::{CancellationReason, RunIdentity, RunManifest};

mod fake;
pub use fake::{FakeExecutionControl, FakeExecutor};

pub const EXECUTION_LOG_LIMIT: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct ExecutionRequest {
    pub runs_root: PathBuf,
    pub manifest: RunManifest,
    pub timeout: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PreparedBy {
    Bun(PathBuf),
    Fake,
}

/// An opaque, single-use execution snapshot whose declared inputs may be staged before spawn.
pub struct PreparedExecution {
    pub(crate) request: ExecutionRequest,
    pub(crate) run_directory: PathBuf,
    pub(crate) prepared_by: PreparedBy,
    pub(crate) cleanup_on_drop: bool,
}

impl PreparedExecution {
    pub fn manifest(&self) -> &RunManifest {
        &self.request.manifest
    }

    /// Resolve the run-local destination for one input declared by the immutable manifest.
    pub fn staged_input_path(&self, input_id: &str) -> Result<PathBuf> {
        let input = self
            .request
            .manifest
            .inputs
            .iter()
            .find(|input| input.input_id == input_id)
            .with_context(|| format!("input {input_id:?} is not declared in the run manifest"))?;
        let file_name = Path::new(&input.file_name);
        if !matches!(
            file_name.components().collect::<Vec<_>>().as_slice(),
            [Component::Normal(_)]
        ) {
            bail!("input {input_id:?} file name must be one relative path component");
        }
        Ok(self.run_directory.join("inputs").join(file_name))
    }
}

impl Drop for PreparedExecution {
    fn drop(&mut self) {
        if self.cleanup_on_drop {
            let _ = std::fs::remove_dir_all(&self.run_directory);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionLog {
    pub stream: ExecutionLogStream,
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionLogStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionOutput {
    pub path: PathBuf,
    pub media_type: String,
}

/// Locations refer to the instrumented entry. S20 preserves them for source-map mapping.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionLocation {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionFailurePhase {
    Import,
    UserRuntime,
    Runner,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionFailure {
    pub phase: ExecutionFailurePhase,
    pub message: String,
    pub stack: Option<String>,
    pub location: Option<ExecutionLocation>,
}
impl ExecutionFailure {
    pub fn runner(message: impl Into<String>) -> Self {
        Self {
            phase: ExecutionFailurePhase::Runner,
            message: message.into(),
            stack: None,
            location: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionEventKind {
    Started {
        process_id: Option<u32>,
    },
    /// A delta, not the final aggregate. Emitted bytes are capped per stream.
    Log(ExecutionLog),
}
#[derive(Debug, Clone, PartialEq)]
pub struct ExecutionEvent {
    pub identity: RunIdentity,
    pub kind: ExecutionEventKind,
}

/// Synchronous nonblocking backend sink; never block, panic, or hold a service lock
/// across execution. There is no unbounded executor event queue. Final result logs
/// are authoritative aggregates and must not be appended again as deltas.
#[derive(Clone)]
pub struct ExecutionObserver(Arc<dyn Fn(ExecutionEvent) + Send + Sync>);
impl Default for ExecutionObserver {
    fn default() -> Self {
        Self::new(|_| {})
    }
}
impl ExecutionObserver {
    pub fn new(sink: impl Fn(ExecutionEvent) + Send + Sync + 'static) -> Self {
        Self(Arc::new(sink))
    }
    pub(crate) fn emit(&self, identity: &RunIdentity, kind: ExecutionEventKind) {
        (self.0)(ExecutionEvent {
            identity: identity.clone(),
            kind,
        });
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionTerminal {
    Succeeded(ExecutionOutput),
    Failed(ExecutionFailure),
    TimedOut,
    Cancelled(CancellationReason),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExecutionResult {
    pub terminal: ExecutionTerminal,
    pub logs: Vec<ExecutionLog>,
}

#[async_trait]
pub trait ScriptExecutor: Send + Sync {
    async fn prepare(&self, request: ExecutionRequest) -> Result<PreparedExecution>;

    /// Host preparation/spawn/IO errors return Err with their source chain; run
    /// failures use the structured terminal. Observe only after successful spawn.
    async fn execute_prepared_observed(
        &self,
        prepared: PreparedExecution,
        cancellation: watch::Receiver<Option<CancellationReason>>,
        observer: ExecutionObserver,
    ) -> Result<ExecutionResult>;

    async fn execute_prepared(
        &self,
        prepared: PreparedExecution,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<ExecutionResult> {
        self.execute_prepared_observed(prepared, cancellation, ExecutionObserver::default())
            .await
    }

    async fn execute(
        &self,
        request: ExecutionRequest,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<ExecutionResult> {
        let prepared = self.prepare(request).await?;
        self.execute_prepared(prepared, cancellation).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::types::*;
    use std::collections::BTreeMap;

    fn request(root: &Path) -> ExecutionRequest {
        ExecutionRequest {
            runs_root: root.to_path_buf(),
            timeout: Duration::from_secs(1),
            manifest: RunManifest {
                schema_version: RUN_MANIFEST_SCHEMA_VERSION,
                identity: RunIdentity {
                    project_id: ProjectId("p".into()),
                    run_id: RunId("r".into()),
                    client_request_id: ClientRequestId("c".into()),
                    source_revision: SourceRevision(1),
                    value_revision: ValueRevision(1),
                    input_revision: InputRevision(1),
                },
                source: SourceSnapshot {
                    source_revision: SourceRevision(1),
                    content_hash: "hash".into(),
                    source: "".into(),
                    instrumented_source: "".into(),
                    source_map: None,
                },
                values: BTreeMap::new(),
                inputs: vec![],
            },
        }
    }

    #[tokio::test]
    async fn fake_is_deterministic_and_records_requests() {
        let expected = ExecutionResult {
            terminal: ExecutionTerminal::TimedOut,
            logs: vec![],
        };
        let fake = FakeExecutor::with_results([expected.clone()]);
        let (_tx, rx) = watch::channel(None);
        let root = tempfile::tempdir().unwrap();
        let prepared = fake.prepare(request(root.path())).await.unwrap();
        assert_eq!(prepared.manifest().identity.run_id.0, "r");
        assert_eq!(fake.execute_prepared(prepared, rx).await.unwrap(), expected);
        assert_eq!(fake.requests().len(), 1);
    }

    #[tokio::test]
    async fn controlled_runs_gate_start_and_allow_late_completion_with_original_identity() {
        let root = tempfile::tempdir().unwrap();
        let fake = FakeExecutor::default();
        let mut first = fake.queue_controlled().unwrap();
        let mut second = fake.queue_controlled().unwrap();
        let (events_tx, mut events) = tokio::sync::mpsc::unbounded_channel();
        let observer = ExecutionObserver::new(move |event| {
            let _ = events_tx.send(event);
        });
        let mut first_request = request(root.path());
        first_request.manifest.identity.run_id = RunId("old".into());
        first_request.manifest.identity.source_revision = SourceRevision(1);
        let old_identity = first_request.manifest.identity.clone();
        let prepared = fake.prepare(first_request).await.unwrap();
        // Service composition can capture output authorization and stage inputs with a fake.
        let _anchor =
            crate::script::output::AuthorizedOutputRoot::from_prepared(&prepared).unwrap();
        let (cancel_old, old_rx) = watch::channel(None);
        let old = {
            let fake = fake.clone();
            let observer = observer.clone();
            tokio::spawn(async move {
                fake.execute_prepared_observed(prepared, old_rx, observer)
                    .await
            })
        };
        assert_eq!(
            first.entered().await.unwrap().manifest.identity,
            old_identity
        );
        assert!(!old.is_finished());
        assert!(events.try_recv().is_err());
        first.start().await.unwrap();
        let event = events.recv().await.unwrap();
        assert_eq!(event.identity, old_identity);
        assert!(matches!(
            event.kind,
            ExecutionEventKind::Started { process_id: None }
        ));

        let mut replacement = request(root.path());
        replacement.manifest.identity.run_id = RunId("new".into());
        replacement.manifest.identity.source_revision = SourceRevision(2);
        let new_identity = replacement.manifest.identity.clone();
        let prepared = fake.prepare(replacement).await.unwrap();
        let (_new_tx, new_rx) = watch::channel(None);
        let new = {
            let fake = fake.clone();
            tokio::spawn(async move {
                fake.execute_prepared_observed(prepared, new_rx, observer)
                    .await
            })
        };
        assert_eq!(
            second.entered().await.unwrap().manifest.identity,
            new_identity
        );
        cancel_old
            .send(Some(CancellationReason::Superseded))
            .unwrap();
        assert_eq!(
            first.cancelled().await.unwrap(),
            CancellationReason::Superseded
        );
        // Cancellation is only observed: a non-cooperating old run remains pending.
        assert!(!old.is_finished());
        second.start().await.unwrap();
        assert_eq!(events.recv().await.unwrap().identity, new_identity);
        second.complete(ExecutionTerminal::TimedOut).await.unwrap();
        assert_eq!(
            new.await.unwrap().unwrap().terminal,
            ExecutionTerminal::TimedOut
        );
        first
            .complete(ExecutionTerminal::Succeeded(ExecutionOutput {
                path: root.path().join("old/output/result.bin"),
                media_type: "image/png".into(),
            }))
            .await
            .unwrap();
        assert!(matches!(
            old.await.unwrap().unwrap().terminal,
            ExecutionTerminal::Succeeded(_)
        ));
        assert_eq!(fake.requests().len(), 2);
        // Started runs stay service-owned until it has awaited terminal completion.
        assert!(root.path().join("old").exists());
    }

    #[tokio::test]
    async fn controlled_prestart_cancellation_and_shutdown_are_observable_without_sleeps() {
        for (shutdown, close_after_request) in [(false, false), (true, false), (false, true)] {
            let root = tempfile::tempdir().unwrap();
            let fake = FakeExecutor::default();
            let mut control = fake.queue_controlled().unwrap();
            let prepared = fake.prepare(request(root.path())).await.unwrap();
            let (cancel, rx) = watch::channel(None);
            let handle = tokio::spawn(async move {
                fake.execute_prepared_observed(
                    prepared,
                    rx,
                    ExecutionObserver::new(|_| panic!("not started")),
                )
                .await
            });
            control.entered().await.unwrap();
            let reason = if shutdown {
                drop(cancel);
                CancellationReason::Shutdown
            } else {
                cancel.send(Some(CancellationReason::User)).unwrap();
                if close_after_request {
                    drop(cancel);
                }
                CancellationReason::User
            };
            assert_eq!(control.cancelled().await.unwrap(), reason);
            assert!(!handle.is_finished());
            control
                .complete(ExecutionTerminal::Cancelled(reason.clone()))
                .await
                .unwrap();
            assert_eq!(
                handle.await.unwrap().unwrap().terminal,
                ExecutionTerminal::Cancelled(reason)
            );
            assert!(!root.path().join("r").exists());
        }
    }

    #[tokio::test]
    async fn controlled_logs_are_bounded_and_controller_drop_unblocks_execution() {
        let root = tempfile::tempdir().unwrap();
        let fake = FakeExecutor::default();
        let mut control = fake.queue_controlled().unwrap();
        let prepared = fake.prepare(request(root.path())).await.unwrap();
        let (_tx, rx) = watch::channel(None);
        let handle = tokio::spawn(async move { fake.execute_prepared(prepared, rx).await });
        control.entered().await.unwrap();
        control.start().await.unwrap();
        control
            .log(ExecutionLog {
                stream: ExecutionLogStream::Stdout,
                text: "x".repeat(EXECUTION_LOG_LIMIT + 1),
                truncated: false,
            })
            .await
            .unwrap();
        control.complete(ExecutionTerminal::TimedOut).await.unwrap();
        let result = handle.await.unwrap().unwrap();
        assert_eq!(result.logs[0].text.len(), EXECUTION_LOG_LIMIT);
        assert!(result.logs[0].truncated);

        let fake = FakeExecutor::default();
        let mut control = fake.queue_controlled().unwrap();
        let mut req = request(root.path());
        req.manifest.identity.run_id = RunId("dropped".into());
        let prepared = fake.prepare(req).await.unwrap();
        let (_tx, rx) = watch::channel(None);
        let handle = tokio::spawn(async move { fake.execute_prepared(prepared, rx).await });
        control.entered().await.unwrap();
        drop(control);
        assert!(handle.await.unwrap().is_err());
        assert!(!root.path().join("dropped").exists());
    }
}
