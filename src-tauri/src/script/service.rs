//! Stateful script orchestration. Application registration belongs to S40.
//!
//! Use one instance globally. Event sinks must be prompt, nonblocking and nonpanicking.
//! Call `shutdown` before application temp cleanup. Trust is session-local and saves
//! must go through `save_project` to preserve trust across editor changes.
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    time::Duration,
};

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use tokio::{
    sync::{watch, Mutex as AsyncMutex, Semaphore},
    task::JoinHandle,
};

use super::{
    executor::*,
    input::{stage_inputs, InputApprovals, InputLimits, InputResources},
    output::{AuthorizedOutputRoot, OutputLease, OutputLimits, OutputRegistry},
    project_store::ProjectStore,
    types::*,
};

#[derive(Clone, Copy)]
pub struct ServiceLimits {
    pub timeout: Duration,
    pub inputs: InputLimits,
    pub outputs: OutputLimits,
}
impl Default for ServiceLimits {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            inputs: InputLimits::default(),
            outputs: OutputLimits::default(),
        }
    }
}

struct RunControl {
    identity: RunIdentity,
    cancellation: watch::Sender<Option<CancellationReason>>,
}
impl RunControl {
    fn cancel(&self, reason: CancellationReason) {
        // First cancellation wins. The executor owns TERM/KILL and its one outcome.
        self.cancellation.send_if_modified(|current| {
            if current.is_some() {
                return false;
            }
            *current = Some(reason);
            true
        });
    }
}
/// Bounded backend detail for the latest runtime failure. Raw locations refer to
/// the instrumented entry; keep its exact source map for later editor mapping.
#[derive(Clone)]
pub struct RunFailureDetails {
    pub identity: RunIdentity,
    pub source: SourceSnapshot,
    pub failure: ExecutionFailure,
}

#[derive(Default)]
struct State {
    closed: bool,
    trusted: HashMap<String, String>,
    pending: Option<RunControl>,
    active: Option<RunControl>,
    last_good: Option<(RunIdentity, OutputLease)>,
    last_failure: Option<RunFailureDetails>,
}
struct Inner {
    store: Arc<ProjectStore>,
    executor: Arc<dyn ScriptExecutor>,
    approvals: Arc<InputApprovals>,
    resources: Arc<dyn InputResources>,
    outputs: Arc<OutputRegistry>,
    // Outputs use the persistent private root: response leases may outlive shutdown.
    workspace: TempDir,
    limits: ServiceLimits,
    sink: Arc<dyn Fn(ScriptRunEvent) + Send + Sync>,
    state: Mutex<State>,
    // Intentionally held over preparation/join: serializes handoffs, never execution.
    scheduler: AsyncMutex<Option<JoinHandle<Result<()>>>>,
    submissions: Arc<Semaphore>,
}
#[derive(Clone)]
pub struct ImageScriptService(Arc<Inner>);

impl ImageScriptService {
    /// Construct off the async event loop (creates private storage).
    pub fn new(
        store: Arc<ProjectStore>,
        executor: Arc<dyn ScriptExecutor>,
        approvals: Arc<InputApprovals>,
        resources: Arc<dyn InputResources>,
        limits: ServiceLimits,
        sink: impl Fn(ScriptRunEvent) + Send + Sync + 'static,
    ) -> Result<Self> {
        if limits.timeout.is_zero() {
            bail!("script timeout must be positive");
        }
        let private = store
            .paths()
            .validated_private_root(true)?
            .context("missing script private root")?;
        let outputs = Arc::new(OutputRegistry::new(&private, limits.outputs)?);
        let workspace = tempfile::Builder::new()
            .prefix("service-")
            .tempdir_in(private)?;
        std::fs::create_dir(workspace.path().join("runs"))?;
        std::fs::create_dir(workspace.path().join("staging"))?;
        Ok(Self(Arc::new(Inner {
            store,
            executor,
            approvals,
            resources,
            outputs,
            workspace,
            limits,
            sink: Arc::new(sink),
            state: Mutex::default(),
            scheduler: AsyncMutex::new(None),
            submissions: Arc::new(Semaphore::new(8)),
        })))
    }

    pub fn output_registry(&self) -> Arc<OutputRegistry> {
        self.0.outputs.clone()
    }

    /// Explicit warning acknowledgement belongs to the calling UI. Trust never
    /// comes from a run request, portable manifest, or project-open operation.
    pub async fn trust_project(&self, project_id: ProjectId) -> Result<()> {
        let store = self.0.store.clone();
        let project = tokio::task::spawn_blocking(move || store.open(&project_id)).await??;
        let mut state = self.0.state()?;
        if state.closed {
            bail!("script service is shut down");
        }
        state
            .trusted
            .insert(project.manifest.project_id.0, hash(&project.source));
        Ok(())
    }

    pub fn revoke_trust(&self, project_id: &ProjectId) -> Result<()> {
        let mut state = self.0.state()?;
        state.trusted.remove(&project_id.0);
        for run in [&state.pending, &state.active].into_iter().flatten() {
            if run.identity.project_id == *project_id {
                run.cancel(CancellationReason::User);
            }
        }
        Ok(())
    }

    /// Serializes editor saves with trust checks. An external edit revokes trust;
    /// a successful service-owned save preserves an existing approval only.
    pub async fn save_project(
        &self,
        project_id: ProjectId,
        source: String,
        revision: SourceRevision,
    ) -> Result<SourceRevision> {
        let _scheduler = self.0.scheduler.lock().await;
        let inner = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<_> {
            let old = inner.store.open(&project_id)?;
            let mut state = inner.state()?;
            if state.closed {
                bail!("script service is shut down");
            }
            let trusted = state.trusted.get(&project_id.0) == Some(&hash(&old.source));
            if !trusted {
                state.trusted.remove(&project_id.0);
            }
            inner.store.save(&project_id, &source)?;
            if trusted {
                state.trusted.insert(project_id.0, hash(&source));
            }
            Ok(revision)
        })
        .await
        .context("script save worker failed")?
    }

    /// Returns after dispatch, not process completion. A bounded owned operation
    /// survives caller disconnection so a dropped command cannot detach a handoff.
    pub async fn run(&self, request: RunRequest) -> Result<RunIdentity> {
        let permit = self
            .0
            .submissions
            .clone()
            .try_acquire_owned()
            .context("script request queue is full or closed")?;
        let inner = self.0.clone();
        tokio::spawn(async move {
            let _permit = permit;
            inner.submit(request).await
        })
        .await
        .context("script submission worker failed")?
    }

    pub fn cancel(&self) -> Result<()> {
        let state = self.0.state()?;
        for run in [&state.pending, &state.active].into_iter().flatten() {
            run.cancel(CancellationReason::User);
        }
        Ok(())
    }

    pub fn last_success(&self) -> Result<Option<(RunIdentity, OutputMetadata)>> {
        Ok(self
            .0
            .state()?
            .last_good
            .as_ref()
            .map(|(id, lease)| (id.clone(), lease.metadata().clone())))
    }

    pub fn last_failure(&self) -> Result<Option<RunFailureDetails>> {
        Ok(self.0.state()?.last_failure.clone())
    }

    /// Idempotent; first closes admission and cancels staging/execution, then joins
    /// the executor and its cleanup before revoking previews. Existing read leases survive.
    pub async fn shutdown(&self) -> Result<()> {
        {
            let mut state = self.0.state()?;
            state.closed = true;
            self.0.submissions.close();
            for run in [&state.pending, &state.active].into_iter().flatten() {
                run.cancel(CancellationReason::Shutdown);
            }
        }
        let inner = self.0.clone();
        // Own shutdown as well: cancelling its caller must not drop the runner join.
        tokio::spawn(async move {
            let mut worker = inner.scheduler.lock().await;
            join_worker(&mut worker).await?;
            let inner = inner.clone();
            tokio::task::spawn_blocking(move || -> Result<()> {
                {
                    let mut state = inner.state()?;
                    state.last_good = None;
                    state.last_failure = None;
                    state.trusted.clear();
                }
                inner.outputs.clear()?;
                match std::fs::remove_dir_all(inner.workspace.path()) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                    result => result.context("failed to clean script workspace"),
                }
            })
            .await
            .context("script shutdown cleanup worker failed")?
        })
        .await
        .context("script shutdown worker failed")?
    }
}

impl Inner {
    fn state(&self) -> Result<MutexGuard<'_, State>> {
        self.state
            .lock()
            .map_err(|_| anyhow::anyhow!("script service state poisoned"))
    }
    fn emit(&self, event: ScriptRunEvent) {
        (self.sink)(event);
    }

    async fn check_trust(self: &Arc<Self>, project_id: ProjectId) -> Result<()> {
        let inner = self.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let project = inner.store.open(&project_id)?;
            let mut state = inner.state()?;
            if state.closed {
                bail!("script service is shut down");
            }
            if state.trusted.get(&project_id.0) != Some(&hash(&project.source)) {
                state.trusted.remove(&project_id.0);
                bail!("script project is untrusted; explicit approval is required");
            }
            Ok(())
        })
        .await
        .context("script trust worker failed")?
    }

    async fn submit(self: Arc<Self>, mut request: RunRequest) -> Result<RunIdentity> {
        let mut worker = self.scheduler.lock().await;
        self.check_trust(request.project_id.clone()).await?;
        if request.source.source.len() > 2 * 1024 * 1024
            || request.source.instrumented_source.len() > 4 * 1024 * 1024
            || request
                .source
                .source_map
                .as_ref()
                .is_some_and(|map| map.len() > 8 * 1024 * 1024)
        {
            bail!("script source snapshot exceeds size limit");
        }
        if request
            .values
            .values()
            .any(|value| matches!(value, ControlValue::Number { value } if !value.is_finite()))
        {
            bail!("script values must be finite");
        }
        if request.values.len() > 1024
            || request.client_request_id.0.len() > 1024
            || request
                .values
                .iter()
                .map(|(key, value)| {
                    key.len().saturating_add(match value {
                        ControlValue::Text { value } => value.len(),
                        _ => 16,
                    })
                })
                .try_fold(0usize, |total, length| total.checked_add(length))
                .is_none_or(|total| total > 4 * 1024 * 1024)
        {
            bail!("script value snapshot exceeds size limit");
        }
        // The backend freezes owned values and computes the actual source hash.
        request.source.content_hash = hash(&request.source.source);
        let identity = RunIdentity {
            project_id: request.project_id.clone(),
            run_id: RunId(super::input::selection_token()?),
            client_request_id: request.client_request_id.clone(),
            source_revision: request.source.source_revision,
            value_revision: request.value_revision,
            input_revision: request.input_revision,
        };
        let (cancellation, receiver) = watch::channel(None);
        {
            let mut state = self.state()?;
            if state.closed {
                bail!("script service is shut down");
            }
            state.pending = Some(RunControl {
                identity: identity.clone(),
                cancellation,
            });
        }
        self.emit(ScriptRunEvent::Queued {
            identity: identity.clone(),
        });
        let result = self
            .prepare_and_dispatch(request, &identity, receiver, &mut worker)
            .await;
        let pending = self.state()?.pending.take();
        if let Err(error) = &result {
            let reason = pending
                .as_ref()
                .and_then(|run| run.cancellation.borrow().clone());
            if let Some(reason) = reason {
                self.emit(ScriptRunEvent::Cancelled {
                    identity: identity.clone(),
                    reason,
                });
            } else {
                self.fail(&identity, DiagnosticSource::Runner, format!("{error:#}"));
            }
        }
        result.map(|()| identity)
    }

    async fn prepare_and_dispatch(
        self: &Arc<Self>,
        request: RunRequest,
        identity: &RunIdentity,
        cancellation: watch::Receiver<Option<CancellationReason>>,
        worker: &mut Option<JoinHandle<Result<()>>>,
    ) -> Result<()> {
        let staged = stage_inputs(
            &self.workspace.path().join("staging"),
            &request.inputs,
            &self.approvals,
            self.resources.as_ref(),
            self.limits.inputs,
            cancellation.clone(),
        )
        .await?;
        let manifest = RunManifest {
            schema_version: RUN_MANIFEST_SCHEMA_VERSION,
            identity: identity.clone(),
            source: request.source,
            values: request.values,
            inputs: staged.inputs().to_vec(),
        };
        let prepared = self
            .executor
            .prepare(ExecutionRequest {
                runs_root: self.workspace.path().join("runs"),
                manifest,
                timeout: self.limits.timeout,
            })
            .await?;
        let prepared = staged.transfer(prepared, cancellation.clone()).await?;
        let anchor = AuthorizedOutputRoot::from_prepared(&prepared)?;
        self.check_trust(identity.project_id.clone()).await?;
        {
            let state = self.state()?;
            if state.closed || cancellation.borrow().is_some() {
                bail!("script preparation cancelled");
            }
            if let Some(active) = &state.active {
                active.cancel(CancellationReason::Superseded);
            }
        }
        join_worker(worker).await?;
        // Trust may have changed while the old executor was stopping.
        self.check_trust(identity.project_id.clone()).await?;
        {
            let mut state = self.state()?;
            if state.closed || cancellation.borrow().is_some() {
                bail!("script preparation cancelled");
            }
            let pending = state.pending.take().context("missing pending script run")?;
            state.active = Some(pending);
            let inner = self.clone();
            *worker = Some(tokio::spawn(async move {
                inner.execute(prepared, anchor, cancellation).await
            }));
        }
        Ok(())
    }

    async fn execute(
        self: Arc<Self>,
        prepared: PreparedExecution,
        anchor: AuthorizedOutputRoot,
        cancellation: watch::Receiver<Option<CancellationReason>>,
    ) -> Result<()> {
        let identity = prepared.manifest().identity.clone();
        let directory = prepared.run_directory.clone();
        let source_snapshot = prepared.manifest().source.clone();
        let inner = self.clone();
        let observer = ExecutionObserver::new(move |event| {
            let event = match event.kind {
                ExecutionEventKind::Started { .. } => ScriptRunEvent::Started {
                    identity: event.identity,
                    started_at: chrono::Utc::now().to_rfc3339(),
                },
                ExecutionEventKind::Log(log) => ScriptRunEvent::Log {
                    identity: event.identity,
                    stream: match log.stream {
                        ExecutionLogStream::Stdout => LogStream::Stdout,
                        ExecutionLogStream::Stderr => LogStream::Stderr,
                    },
                    message: log.text,
                },
            };
            inner.emit(event);
        });
        let result = self
            .executor
            .execute_prepared_observed(prepared, cancellation.clone(), observer)
            .await;
        // Finalization is an atomic boundary: cancellation requested before the
        // process outcome wins, including late success. Afterward the process is
        // already stopped; Stop cannot revoke an output being validated/published.
        // Keeping the join handle in the scheduler still blocks the next process.
        let cancellation_reason = {
            let mut state = self.state()?;
            let reason = cancellation.borrow().clone();
            state.active = None;
            reason
        };
        let terminal = match result {
            Ok(result) => result.terminal, // Logs were already emitted as bounded live deltas.
            Err(error) => ExecutionTerminal::Failed(ExecutionFailure::runner(format!("{error:#}"))),
        };
        let output = if cancellation_reason.is_none() {
            if let ExecutionTerminal::Succeeded(output) = &terminal {
                let registry = self.outputs.clone();
                let output = output.clone();
                Some(
                    tokio::task::spawn_blocking(move || registry.register(&anchor, &output))
                        .await
                        .context("output validation worker failed")
                        .and_then(|result| result),
                )
            } else {
                None
            }
        } else {
            None
        };
        // The process has terminated and validation has its own copy. Never remove
        // a live executor's directory, even when it reports success after cancel.
        if let Err(error) = cleanup_run(directory).await {
            let mut warning = diagnostic(DiagnosticSource::Runner, format!("{error:#}"));
            warning.severity = DiagnosticSeverity::Warning;
            self.emit(ScriptRunEvent::Diagnostic {
                identity: identity.clone(),
                diagnostic: warning,
            });
        }
        let event = {
            let mut state = self.state()?;
            state.last_failure = None;
            if let Some(reason) = cancellation_reason {
                ScriptRunEvent::Cancelled {
                    identity: identity.clone(),
                    reason,
                }
            } else if let Some(output) = output {
                match output {
                    Ok(lease) => {
                        let metadata = lease.metadata().clone();
                        state.last_good = Some((identity.clone(), lease));
                        ScriptRunEvent::Succeeded {
                            identity: identity.clone(),
                            output: metadata,
                        }
                    }
                    Err(error) => ScriptRunEvent::Failed {
                        identity: identity.clone(),
                        diagnostic: diagnostic(
                            DiagnosticSource::OutputValidation,
                            format!("{error:#}"),
                        ),
                    },
                }
            } else {
                match terminal {
                    ExecutionTerminal::Failed(failure) => {
                        let source = match failure.phase {
                            ExecutionFailurePhase::Import => DiagnosticSource::Bun,
                            ExecutionFailurePhase::UserRuntime => DiagnosticSource::UserRuntime,
                            ExecutionFailurePhase::Runner => DiagnosticSource::Runner,
                        };
                        state.last_failure = Some(RunFailureDetails {
                            identity: identity.clone(),
                            source: source_snapshot,
                            failure: failure.clone(),
                        });
                        // Do not mislabel instrumented positions as editor locations.
                        ScriptRunEvent::Failed {
                            identity: identity.clone(),
                            diagnostic: diagnostic(source, failure.message),
                        }
                    }
                    ExecutionTerminal::TimedOut => ScriptRunEvent::Failed {
                        identity: identity.clone(),
                        diagnostic: diagnostic(
                            DiagnosticSource::Timeout,
                            "Script execution timed out".into(),
                        ),
                    },
                    ExecutionTerminal::Cancelled(reason) => ScriptRunEvent::Cancelled {
                        identity: identity.clone(),
                        reason,
                    },
                    ExecutionTerminal::Succeeded(_) => {
                        unreachable!("uncancelled success was validated")
                    }
                }
            }
        };
        if let ScriptRunEvent::Failed { diagnostic, .. } = &event {
            self.emit(ScriptRunEvent::Diagnostic {
                identity: identity.clone(),
                diagnostic: diagnostic.clone(),
            });
        }
        self.emit(event);
        Ok(())
    }

    fn fail(&self, identity: &RunIdentity, source: DiagnosticSource, message: String) {
        let diagnostic = diagnostic(source, message);
        self.emit(ScriptRunEvent::Diagnostic {
            identity: identity.clone(),
            diagnostic: diagnostic.clone(),
        });
        self.emit(ScriptRunEvent::Failed {
            identity: identity.clone(),
            diagnostic,
        });
    }
}

async fn join_worker(worker: &mut Option<JoinHandle<Result<()>>>) -> Result<()> {
    if let Some(task) = worker.as_mut() {
        // Await by reference: dropping this future never loses the join handle.
        let result = task.await.context("script execution worker failed");
        *worker = None;
        result??;
    }
    Ok(())
}
async fn cleanup_run(directory: PathBuf) -> Result<()> {
    tokio::task::spawn_blocking(move || match std::fs::remove_dir_all(directory) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        result => result,
    })
    .await
    .context("script cleanup worker failed")?
    .context("failed to clean script run")
}
fn hash(source: &str) -> String {
    hex::encode(Sha256::digest(source.as_bytes()))
}
fn diagnostic(source: DiagnosticSource, message: String) -> ScriptDiagnostic {
    ScriptDiagnostic {
        source,
        severity: DiagnosticSeverity::Error,
        message,
        code: None,
        location: None,
    }
}

#[cfg(test)]
mod tests;
