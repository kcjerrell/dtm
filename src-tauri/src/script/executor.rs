use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use tokio::sync::watch;

use super::types::{CancellationReason, RunManifest};

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

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionTerminal {
    Succeeded(ExecutionOutput),
    Failed(String),
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

    async fn execute_prepared(
        &self,
        prepared: PreparedExecution,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<ExecutionResult>;

    async fn execute(
        &self,
        request: ExecutionRequest,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<ExecutionResult> {
        let prepared = self.prepare(request).await?;
        self.execute_prepared(prepared, cancellation).await
    }
}

/// A deterministic queue-backed executor for service lifecycle tests.
#[derive(Clone, Default)]
pub struct FakeExecutor {
    results: Arc<Mutex<VecDeque<Result<ExecutionResult, String>>>>,
    requests: Arc<Mutex<Vec<ExecutionRequest>>>,
}

impl FakeExecutor {
    pub fn with_results(results: impl IntoIterator<Item = ExecutionResult>) -> Self {
        Self {
            results: Arc::new(Mutex::new(
                results.into_iter().map(Ok).collect::<VecDeque<_>>(),
            )),
            requests: Arc::default(),
        }
    }

    pub fn push_error(&self, message: impl Into<String>) {
        self.results.lock().unwrap().push_back(Err(message.into()));
    }

    pub fn requests(&self) -> Vec<ExecutionRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl ScriptExecutor for FakeExecutor {
    async fn prepare(&self, request: ExecutionRequest) -> Result<PreparedExecution> {
        Ok(PreparedExecution {
            run_directory: request.runs_root.join(&request.manifest.identity.run_id.0),
            request,
            prepared_by: PreparedBy::Fake,
            cleanup_on_drop: false,
        })
    }

    async fn execute_prepared(
        &self,
        prepared: PreparedExecution,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<ExecutionResult> {
        if prepared.prepared_by != PreparedBy::Fake {
            bail!("prepared execution belongs to a different executor");
        }
        self.requests.lock().unwrap().push(prepared.request.clone());
        if let Some(reason) = cancellation.borrow().clone() {
            return Ok(ExecutionResult {
                terminal: ExecutionTerminal::Cancelled(reason),
                logs: Vec::new(),
            });
        }
        match self.results.lock().unwrap().pop_front() {
            Some(Ok(result)) => Ok(result),
            Some(Err(message)) => Err(anyhow::anyhow!(message)),
            None => bail!("fake executor has no queued result"),
        }
        .context("fake script execution failed")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::types::*;
    use std::collections::BTreeMap;

    fn request() -> ExecutionRequest {
        ExecutionRequest {
            runs_root: PathBuf::from("runs"),
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
        let prepared = fake.prepare(request()).await.unwrap();
        assert_eq!(prepared.manifest().identity.run_id.0, "r");
        assert_eq!(fake.execute_prepared(prepared, rx).await.unwrap(), expected);
        assert_eq!(fake.requests().len(), 1);
    }
}
