use super::*;
use async_trait::async_trait;
use tokio::sync::mpsc;

struct NoResources;
#[async_trait]
impl InputResources for NoResources {
    async fn resolve(&self, _: &str) -> Result<Arc<dyn crate::ResourceHandle>> {
        bail!("no resource")
    }
}
struct Harness {
    _root: TempDir,
    store: Arc<ProjectStore>,
    service: ImageScriptService,
    fake: FakeExecutor,
    project: ProjectId,
    events: mpsc::UnboundedReceiver<ScriptRunEvent>,
}
impl Harness {
    fn new() -> Self {
        Self::with_resources(Arc::new(NoResources))
    }
    fn with_resources(resources: Arc<dyn InputResources>) -> Self {
        let root = tempfile::tempdir().unwrap();
        let store = Arc::new(ProjectStore::new(root.path()));
        let project = store.create("test").unwrap().manifest.project_id;
        let fake = FakeExecutor::default();
        let (tx, events) = mpsc::unbounded_channel();
        let service = ImageScriptService::new(
            store.clone(),
            Arc::new(fake.clone()),
            Arc::default(),
            resources,
            ServiceLimits::default(),
            move |event| {
                let _ = tx.send(event);
            },
        )
        .unwrap();
        Self {
            _root: root,
            store,
            service,
            fake,
            project,
            events,
        }
    }
    fn request(&self, revision: u64) -> RunRequest {
        RunRequest {
            project_id: self.project.clone(),
            client_request_id: ClientRequestId(format!("client-{revision}")),
            source: SourceSnapshot {
                source_revision: SourceRevision(revision),
                content_hash: "caller hash is not authoritative".into(),
                source: "source snapshot".into(),
                instrumented_source: "instrumented snapshot".into(),
                source_map: Some("frozen map".into()),
            },
            value_revision: ValueRevision(revision + 10),
            input_revision: InputRevision(revision + 20),
            values: Default::default(),
            inputs: vec![],
        }
    }
    async fn trust(&self) {
        self.service
            .trust_project(self.project.clone())
            .await
            .unwrap();
    }
    async fn event(&mut self) -> ScriptRunEvent {
        tokio::time::timeout(Duration::from_secs(10), self.events.recv())
            .await
            .unwrap()
            .unwrap()
    }
    async fn terminal(&mut self) -> ScriptRunEvent {
        loop {
            let event = self.event().await;
            if matches!(
                event,
                ScriptRunEvent::Succeeded { .. }
                    | ScriptRunEvent::Failed { .. }
                    | ScriptRunEvent::Cancelled { .. }
            ) {
                return event;
            }
        }
    }
}
fn write_output(request: &ExecutionRequest) -> ExecutionTerminal {
    let directory = request
        .runs_root
        .join(&request.manifest.identity.run_id.0)
        .join("output");
    std::fs::create_dir(&directory).unwrap();
    let path = directory.join("image.png");
    std::fs::write(
        &path,
        crate::script::output::tests::image(image::ImageFormat::Png),
    )
    .unwrap();
    ExecutionTerminal::Succeeded(ExecutionOutput {
        path,
        media_type: "image/png".into(),
    })
}

#[tokio::test]
async fn untrusted_and_externally_changed_projects_never_dispatch() {
    let h = Harness::new();
    assert!(h
        .service
        .run(h.request(1))
        .await
        .unwrap_err()
        .to_string()
        .contains("untrusted"));
    h.trust().await;
    let approved_source = h.store.open(&h.project).unwrap().source;
    h.store.save(&h.project, "externally modified").unwrap();
    assert!(h.service.run(h.request(2)).await.is_err());
    // Reverting external contents does not restore a revoked approval.
    h.store.save(&h.project, &approved_source).unwrap();
    assert!(h.service.run(h.request(3)).await.is_err());
    assert!(h.fake.requests().is_empty());
    assert!(h
        .service
        .0
        .workspace
        .path()
        .join("runs")
        .read_dir()
        .unwrap()
        .next()
        .is_none());
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn editor_save_preserves_only_existing_trust_and_shutdown_rejects_requests() {
    let mut h = Harness::new();
    h.service
        .save_project(h.project.clone(), "saved".into(), SourceRevision(7))
        .await
        .unwrap();
    assert!(h.service.run(h.request(1)).await.is_err());
    h.trust().await;
    assert_eq!(
        h.service
            .save_project(h.project.clone(), "editor change".into(), SourceRevision(8))
            .await
            .unwrap(),
        SourceRevision(8)
    );
    h.fake.push_error("spawn failure");
    h.service.run(h.request(2)).await.unwrap();
    assert!(matches!(h.terminal().await, ScriptRunEvent::Failed { .. }));
    h.service.shutdown().await.unwrap();
    h.service.shutdown().await.unwrap();
    assert!(h.service.run(h.request(3)).await.is_err());
    assert!(h.service.trust_project(h.project.clone()).await.is_err());
}

#[tokio::test]
async fn replacement_waits_for_single_old_outcome_and_ignores_late_success() {
    let mut h = Harness::new();
    h.trust().await;
    let mut old = h.fake.queue_controlled().unwrap();
    let mut next = h.fake.queue_controlled().unwrap();
    let old_id = h.service.run(h.request(1)).await.unwrap();
    let old_request = old.entered().await.unwrap();
    old.start().await.unwrap();
    assert!(matches!(h.event().await, ScriptRunEvent::Queued { .. }));
    assert!(matches!(h.event().await, ScriptRunEvent::Started { .. }));
    let service = h.service.clone();
    let request = h.request(2);
    let replacement = tokio::spawn(async move { service.run(request).await });
    assert_eq!(
        old.cancelled().await.unwrap(),
        CancellationReason::Superseded
    );
    assert_eq!(h.fake.requests().len(), 1);
    assert!(!replacement.is_finished());
    old.complete(write_output(&old_request)).await.unwrap();
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Cancelled { identity, reason: CancellationReason::Superseded } if identity == old_id)
    );
    let next_id = replacement.await.unwrap().unwrap();
    let next_request = next.entered().await.unwrap();
    assert_eq!(next_request.manifest.identity, next_id);
    assert_ne!(old_id.run_id, next_id.run_id);
    assert!(h.service.last_success().unwrap().is_none());
    next.start().await.unwrap();
    next.complete(write_output(&next_request)).await.unwrap();
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Succeeded { identity, .. } if identity == next_id)
    );
    assert_eq!(h.service.last_success().unwrap().unwrap().0, next_id);
    assert!(!old_request.runs_root.join(old_id.run_id.0).exists());
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn invalid_replacement_does_not_cancel_active_run() {
    let mut h = Harness::new();
    h.trust().await;
    let mut run = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    run.entered().await.unwrap();
    run.start().await.unwrap();
    let mut invalid = h.request(2);
    invalid.inputs.push(SelectedInput::LocalFile {
        input_id: "input".into(),
        display_name: "image".into(),
        selection_token: "unapproved".into(),
    });
    assert!(h.service.run(invalid).await.is_err());
    assert!(h
        .service
        .0
        .state()
        .unwrap()
        .active
        .as_ref()
        .unwrap()
        .cancellation
        .borrow()
        .is_none());
    assert_eq!(h.fake.requests().len(), 1);
    run.complete(ExecutionTerminal::TimedOut).await.unwrap();
    // The failed preparation has its own single terminal event.
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Failed { identity, .. } if identity.source_revision == SourceRevision(2))
    );
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Failed { identity, .. } if identity.source_revision == SourceRevision(1))
    );
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn immutable_revisions_live_logs_and_last_good_survive_failures() {
    let mut h = Harness::new();
    h.trust().await;
    let mut run = h.fake.queue_controlled().unwrap();
    let request = h.request(3);
    let identity = h.service.run(request.clone()).await.unwrap();
    let captured = run.entered().await.unwrap();
    assert_eq!(
        captured.manifest.source.source_map,
        request.source.source_map
    );
    assert_eq!(
        captured.manifest.source.content_hash,
        hash(&request.source.source)
    );
    assert_eq!(identity.source_revision, SourceRevision(3));
    assert_eq!(identity.value_revision, ValueRevision(13));
    assert_eq!(identity.input_revision, InputRevision(23));
    run.start().await.unwrap();
    run.log(ExecutionLog {
        stream: ExecutionLogStream::Stderr,
        text: "one delta".into(),
        truncated: false,
    })
    .await
    .unwrap();
    run.complete(write_output(&captured)).await.unwrap();
    let mut log_count = 0;
    loop {
        match h.event().await {
            ScriptRunEvent::Log {
                identity: id,
                message,
                ..
            } => {
                assert_eq!(id, identity);
                assert_eq!(message, "one delta");
                log_count += 1;
            }
            ScriptRunEvent::Succeeded { identity: id, .. } => {
                assert_eq!(id, identity);
                break;
            }
            ScriptRunEvent::Queued { identity: id }
            | ScriptRunEvent::Started { identity: id, .. } => assert_eq!(id, identity),
            event => panic!("unexpected {event:?}"),
        }
    }
    assert_eq!(log_count, 1);
    let last_good = h.service.last_success().unwrap().unwrap();
    let token = last_good
        .1
        .preview_url
        .strip_prefix("dtm://script-output/")
        .unwrap();
    let lease = h.service.output_registry().acquire(token).unwrap();
    for terminal in [
        ExecutionTerminal::Failed(ExecutionFailure {
            phase: ExecutionFailurePhase::Import,
            message: "compile failed".into(),
            stack: None,
            location: None,
        }),
        ExecutionTerminal::TimedOut,
    ] {
        let mut run = h.fake.queue_controlled().unwrap();
        h.service.run(h.request(4)).await.unwrap();
        run.entered().await.unwrap();
        run.start().await.unwrap();
        run.complete(terminal).await.unwrap();
        assert!(matches!(h.terminal().await, ScriptRunEvent::Failed { .. }));
        assert_eq!(h.service.last_success().unwrap().unwrap(), last_good);
    }
    h.service.shutdown().await.unwrap();
    assert!(h.service.output_registry().acquire(token).is_err());
    assert!(!lease.read().unwrap().is_empty());
    assert!(!h.service.0.workspace.path().exists());
}

#[tokio::test]
async fn cancellation_is_once_and_shutdown_joins_before_cleanup() {
    let mut h = Harness::new();
    h.trust().await;
    let mut run = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    let request = run.entered().await.unwrap();
    run.start().await.unwrap();
    h.service.cancel().unwrap();
    let observed = h
        .service
        .0
        .state()
        .unwrap()
        .active
        .as_ref()
        .unwrap()
        .cancellation
        .subscribe();
    h.service.cancel().unwrap();
    assert!(!observed.has_changed().unwrap());
    assert_eq!(run.cancelled().await.unwrap(), CancellationReason::User);
    let service = h.service.clone();
    let shutdown = tokio::spawn(async move { service.shutdown().await });
    assert!(!shutdown.is_finished());
    assert!(request
        .runs_root
        .join(&request.manifest.identity.run_id.0)
        .exists());
    run.complete(ExecutionTerminal::Cancelled(CancellationReason::User))
        .await
        .unwrap();
    shutdown.await.unwrap().unwrap();
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled {
            reason: CancellationReason::User,
            ..
        }
    ));
    assert!(h.events.try_recv().is_err());
    assert!(!request
        .runs_root
        .join(&request.manifest.identity.run_id.0)
        .exists());
}

#[tokio::test]
async fn shutdown_reason_reaches_runner() {
    let mut h = Harness::new();
    h.trust().await;
    let mut run = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    run.entered().await.unwrap();
    run.start().await.unwrap();
    let service = h.service.clone();
    let shutdown = tokio::spawn(async move { service.shutdown().await });
    assert_eq!(run.cancelled().await.unwrap(), CancellationReason::Shutdown);
    assert!(!shutdown.is_finished());
    run.complete(ExecutionTerminal::TimedOut).await.unwrap();
    shutdown.await.unwrap().unwrap();
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled {
            reason: CancellationReason::Shutdown,
            ..
        }
    ));
}

struct GatedResources {
    entered: tokio::sync::Notify,
}
#[async_trait]
impl InputResources for GatedResources {
    async fn resolve(&self, _: &str) -> Result<Arc<dyn crate::ResourceHandle>> {
        self.entered.notify_one();
        std::future::pending().await
    }
}

#[tokio::test]
async fn shutdown_cancels_pending_staging_without_starting_a_process() {
    let resources = Arc::new(GatedResources {
        entered: tokio::sync::Notify::new(),
    });
    let mut h = Harness::with_resources(resources.clone());
    h.trust().await;
    let mut request = h.request(1);
    request.inputs.push(SelectedInput::DrawThings {
        input_id: "i".into(),
        display_name: "test".into(),
        resource_id: "r".into(),
    });
    let service = h.service.clone();
    let pending = tokio::spawn(async move { service.run(request).await });
    resources.entered.notified().await;
    h.service.shutdown().await.unwrap();
    assert!(pending.await.unwrap().is_err());
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled {
            reason: CancellationReason::Shutdown,
            ..
        }
    ));
    assert!(h.fake.requests().is_empty());
    assert!(!h.service.0.workspace.path().exists());
}

#[tokio::test]
async fn dropped_replacement_caller_cannot_detach_the_old_process_join() {
    let mut h = Harness::new();
    h.trust().await;
    let mut old = h.fake.queue_controlled().unwrap();
    let mut next = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    old.entered().await.unwrap();
    old.start().await.unwrap();
    let service = h.service.clone();
    let request = h.request(2);
    let caller = tokio::spawn(async move { service.run(request).await });
    assert_eq!(
        old.cancelled().await.unwrap(),
        CancellationReason::Superseded
    );
    caller.abort();
    caller.await.unwrap_err();
    assert_eq!(h.fake.requests().len(), 1);
    old.complete(ExecutionTerminal::TimedOut).await.unwrap();
    let next_request = next.entered().await.unwrap();
    next.start().await.unwrap();
    next.complete(write_output(&next_request)).await.unwrap();
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled { .. }
    ));
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Succeeded { .. }
    ));
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn revoked_trust_cancels_active_execution_and_blocks_rerun() {
    let mut h = Harness::new();
    h.trust().await;
    let mut run = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    run.entered().await.unwrap();
    run.start().await.unwrap();
    h.service.revoke_trust(&h.project).unwrap();
    assert_eq!(run.cancelled().await.unwrap(), CancellationReason::User);
    run.complete(ExecutionTerminal::TimedOut).await.unwrap();
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled { .. }
    ));
    assert!(h.service.run(h.request(2)).await.is_err());
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn failure_phases_preserve_frozen_mapping_and_output_validation_has_its_own_source() {
    let mut h = Harness::new();
    h.trust().await;
    for (phase, source) in [
        (ExecutionFailurePhase::Import, DiagnosticSource::Bun),
        (
            ExecutionFailurePhase::UserRuntime,
            DiagnosticSource::UserRuntime,
        ),
        (ExecutionFailurePhase::Runner, DiagnosticSource::Runner),
    ] {
        let mut run = h.fake.queue_controlled().unwrap();
        let id = h.service.run(h.request(1)).await.unwrap();
        let request = run.entered().await.unwrap();
        run.start().await.unwrap();
        let failure = ExecutionFailure {
            phase,
            message: "failure".into(),
            stack: Some("raw stack".into()),
            location: Some(ExecutionLocation {
                file: "process.ts".into(),
                line: 1,
                column: 9,
            }),
        };
        run.complete(ExecutionTerminal::Failed(failure.clone()))
            .await
            .unwrap();
        assert!(
            matches!(h.terminal().await, ScriptRunEvent::Failed { diagnostic, .. } if diagnostic.source == source && diagnostic.location.is_none())
        );
        let details = h.service.last_failure().unwrap().unwrap();
        assert_eq!(details.identity, id);
        assert_eq!(details.source, request.manifest.source);
        assert_eq!(details.failure, failure);
    }
    let mut run = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(2)).await.unwrap();
    let request = run.entered().await.unwrap();
    run.start().await.unwrap();
    let output = write_output(&request);
    let ExecutionTerminal::Succeeded(image) = &output else {
        panic!()
    };
    std::fs::write(&image.path, "not an image").unwrap();
    run.complete(output).await.unwrap();
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Failed { diagnostic, .. } if diagnostic.source == DiagnosticSource::OutputValidation)
    );
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn real_bun_composes_approved_input_events_preview_and_cleanup() {
    use crate::script::{bun::BunExecutor, bun_probe::prepared_sidecar_path};
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        _ => panic!("unsupported test target"),
    };
    let mut h = Harness::new();
    let approvals = Arc::new(InputApprovals::default());
    let image = crate::script::output::tests::image(image::ImageFormat::Png);
    let original = h._root.path().join("original.png");
    std::fs::write(&original, &image).unwrap();
    let token = approvals
        .approve_local(&original, Duration::from_secs(60))
        .unwrap();
    let (tx, events) = mpsc::unbounded_channel();
    h.service = ImageScriptService::new(
        h.store.clone(),
        Arc::new(BunExecutor::new(prepared_sidecar_path(target))),
        approvals,
        Arc::new(NoResources),
        ServiceLimits::default(),
        move |event| {
            let _ = tx.send(event);
        },
    )
    .unwrap();
    h.events = events;
    h.trust().await;
    let mut request = h.request(1);
    request.source.source = "createImageProcess(async (dtm) => { console.log('service round trip'); return await dtm.input('Image'); })".into();
    request.source.instrumented_source = "createImageProcess(async (dtm) => { console.log('service round trip'); return await dtm.__input('image'); })".into();
    request.source.source_map = None;
    request.inputs.push(SelectedInput::LocalFile {
        input_id: "image".into(),
        display_name: "Image".into(),
        selection_token: token,
    });
    let identity = h.service.run(request).await.unwrap();
    let mut started = false;
    let mut logs = 0;
    let output = loop {
        match h.event().await {
            ScriptRunEvent::Queued { identity: id } => assert_eq!(id, identity),
            ScriptRunEvent::Started { identity: id, .. } => {
                assert_eq!(id, identity);
                started = true;
            }
            ScriptRunEvent::Log { message, .. } => {
                assert!(started);
                assert_eq!(message, "service round trip\n");
                logs += 1;
            }
            ScriptRunEvent::Succeeded { output, .. } => break output,
            event => panic!("unexpected {event:?}"),
        }
    };
    assert!(started);
    assert_eq!(logs, 1);
    let token = output
        .preview_url
        .strip_prefix("dtm://script-output/")
        .unwrap();
    assert_eq!(
        h.service
            .output_registry()
            .acquire(token)
            .unwrap()
            .read()
            .unwrap(),
        image
    );
    assert_eq!(std::fs::read(original).unwrap(), image);
    h.service.shutdown().await.unwrap();
    assert!(!h.service.0.workspace.path().exists());
}
