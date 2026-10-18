//! Explicit gates for service race tests; cancellation is observed, not auto-completed.
use super::*;
use std::collections::VecDeque;
use std::sync::Mutex;
use tokio::sync::{mpsc, oneshot};

enum Queued {
    Ready(Result<ExecutionResult, String>),
    Controlled {
        entered: oneshot::Sender<ExecutionRequest>,
        commands: mpsc::Receiver<ControlCommand>,
        cancellation: watch::Sender<Option<CancellationReason>>,
    },
}
enum ControlCommand {
    Start,
    Log(ExecutionLog),
    Complete(ExecutionTerminal),
}

/// One run's controller. All gates are explicit; tests need no timing sleeps.
pub struct FakeExecutionControl {
    entered: oneshot::Receiver<ExecutionRequest>,
    commands: mpsc::Sender<ControlCommand>,
    cancellation: watch::Receiver<Option<CancellationReason>>,
}
impl FakeExecutionControl {
    /// Call once to await entry into the executor, before its start gate opens.
    pub async fn entered(&mut self) -> Result<ExecutionRequest> {
        (&mut self.entered)
            .await
            .context("fake execution never entered")
    }
    /// Queue start; the observer's Started event acknowledges that the gate opened.
    pub async fn start(&self) -> Result<()> {
        self.commands
            .send(ControlCommand::Start)
            .await
            .context("fake execution ended")
    }
    pub async fn log(&self, log: ExecutionLog) -> Result<()> {
        self.commands
            .send(ControlCommand::Log(log))
            .await
            .context("fake execution ended")
    }
    /// May deliberately succeed after cancellation to test stale completion guards.
    /// Await the execution task afterward before deleting service-owned run files.
    pub async fn complete(&self, terminal: ExecutionTerminal) -> Result<()> {
        self.commands
            .send(ControlCommand::Complete(terminal))
            .await
            .context("fake execution ended")
    }
    pub async fn cancelled(&mut self) -> Result<CancellationReason> {
        self.cancellation
            .wait_for(|value| value.is_some())
            .await
            .context("fake execution ended before cancellation")?
            .clone()
            .context("missing cancellation reason")
    }
}

#[derive(Clone, Default)]
pub struct FakeExecutor {
    queued: Arc<Mutex<VecDeque<Queued>>>,
    requests: Arc<Mutex<Vec<ExecutionRequest>>>,
}
impl FakeExecutor {
    pub fn with_results(results: impl IntoIterator<Item = ExecutionResult>) -> Self {
        Self {
            queued: Arc::new(Mutex::new(
                results.into_iter().map(|r| Queued::Ready(Ok(r))).collect(),
            )),
            requests: Arc::default(),
        }
    }
    pub fn queue_controlled(&self) -> Result<FakeExecutionControl> {
        let (entered_tx, entered) = oneshot::channel();
        let (commands_tx, commands) = mpsc::channel(16);
        let (cancellation, cancellation_rx) = watch::channel(None);
        self.queued
            .lock()
            .map_err(|_| anyhow::anyhow!("fake queue poisoned"))?
            .push_back(Queued::Controlled {
                entered: entered_tx,
                commands,
                cancellation,
            });
        Ok(FakeExecutionControl {
            entered,
            commands: commands_tx,
            cancellation: cancellation_rx,
        })
    }
    pub fn push_error(&self, message: impl Into<String>) {
        self.queued
            .lock()
            .unwrap()
            .push_back(Queued::Ready(Err(message.into())));
    }
    pub fn requests(&self) -> Vec<ExecutionRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl ScriptExecutor for FakeExecutor {
    async fn prepare(&self, request: ExecutionRequest) -> Result<PreparedExecution> {
        let id = Path::new(&request.manifest.identity.run_id.0);
        if !matches!(
            id.components().collect::<Vec<_>>().as_slice(),
            [Component::Normal(_)]
        ) {
            bail!("run ID must be one relative path component");
        }
        let root = request
            .runs_root
            .canonicalize()
            .context("invalid fake run root")?;
        let directory = root.join(id);
        std::fs::create_dir(&directory).context("failed to prepare fake run")?;
        let prepared = PreparedExecution {
            request,
            run_directory: directory,
            prepared_by: PreparedBy::Fake,
            cleanup_on_drop: true,
        };
        std::fs::create_dir(prepared.run_directory.join("inputs"))?;
        Ok(prepared)
    }

    async fn execute_prepared_observed(
        &self,
        mut prepared: PreparedExecution,
        mut cancellation: watch::Receiver<Option<CancellationReason>>,
        observer: ExecutionObserver,
    ) -> Result<ExecutionResult> {
        if prepared.prepared_by != PreparedBy::Fake {
            bail!("prepared execution belongs to a different executor");
        }
        self.requests
            .lock()
            .map_err(|_| anyhow::anyhow!("fake requests poisoned"))?
            .push(prepared.request.clone());
        let queued = self
            .queued
            .lock()
            .map_err(|_| anyhow::anyhow!("fake queue poisoned"))?
            .pop_front()
            .context("fake executor has no queued result")?;
        let identity = &prepared.request.manifest.identity;
        match queued {
            Queued::Ready(result) => {
                if let Some(reason) = cancellation.borrow().clone() {
                    return Ok(ExecutionResult {
                        terminal: ExecutionTerminal::Cancelled(reason),
                        logs: vec![],
                    });
                }
                let result = result
                    .map_err(anyhow::Error::msg)
                    .context("fake script execution failed")?;
                prepared.cleanup_on_drop = false;
                observer.emit(identity, ExecutionEventKind::Started { process_id: None });
                for log in &result.logs {
                    observer.emit(identity, ExecutionEventKind::Log(log.clone()));
                }
                Ok(result)
            }
            Queued::Controlled {
                entered,
                mut commands,
                cancellation: observed,
            } => {
                let _ = entered.send(prepared.request.clone());
                observed.send_replace(cancellation.borrow().clone());
                let mut cancellation_open = true;
                let mut started = false;
                let mut logs = vec![];
                loop {
                    tokio::select! {
                        changed = cancellation.changed(), if cancellation_open => {
                            let reason = if changed.is_err() {
                                cancellation_open = false;
                                cancellation.borrow().clone().or(Some(CancellationReason::Shutdown))
                            } else { cancellation.borrow().clone() };
                            observed.send_replace(reason);
                        }
                        command = commands.recv() => match command.context("fake controller dropped before completion")? {
                            ControlCommand::Start => {
                                if started { bail!("fake execution already started"); }
                                started = true;
                                prepared.cleanup_on_drop = false;
                                observer.emit(identity, ExecutionEventKind::Started { process_id: None });
                            }
                            ControlCommand::Log(mut log) => {
                                if !started { bail!("fake log before start"); }
                                let aggregate = if let Some(index) = logs.iter().position(|value: &ExecutionLog| value.stream == log.stream) {
                                    &mut logs[index]
                                } else {
                                    logs.push(ExecutionLog { stream: log.stream, text: String::new(), truncated: false });
                                    logs.last_mut().context("missing fake log")?
                                };
                                let remaining = EXECUTION_LOG_LIMIT.saturating_sub(aggregate.text.len());
                                let mut end = log.text.len().min(remaining);
                                while !log.text.is_char_boundary(end) { end -= 1; }
                                log.truncated |= end < log.text.len();
                                log.text.truncate(end);
                                aggregate.text.push_str(&log.text);
                                let newly_truncated = log.truncated && !aggregate.truncated;
                                aggregate.truncated |= log.truncated;
                                if !log.text.is_empty() || newly_truncated { observer.emit(identity, ExecutionEventKind::Log(log)); }
                            }
                            ControlCommand::Complete(terminal) => {
                                if !started && matches!(terminal, ExecutionTerminal::Succeeded(_)) { bail!("fake success before start"); }
                                return Ok(ExecutionResult { terminal, logs });
                            }
                        }
                    }
                }
            }
        }
    }
}
