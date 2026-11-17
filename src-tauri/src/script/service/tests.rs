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
                source: self.store.open(&self.project).unwrap().source,
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
            .trust_project(
                self.project.clone(),
                self.store.open(&self.project).unwrap().source,
            )
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
    assert!(h
        .service
        .trust_project(h.project.clone(), String::new())
        .await
        .is_err());
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
    let mut request = h.request(1);
    request.source.source = "createImageProcess(async (dtm) => { console.log('service round trip'); return await dtm.input('Image'); })".into();
    request.source.instrumented_source = "createImageProcess(async (dtm) => { console.log('service round trip'); return await dtm.__input('image'); })".into();
    request.source.source_map = None;
    h.store.save(&h.project, &request.source.source).unwrap();
    h.trust().await;
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

#[tokio::test]
async fn a_different_source_snapshot_cannot_replace_a_trusted_active_run() {
    let mut h = Harness::new();
    h.trust().await;
    let mut active = h.fake.queue_controlled().unwrap();
    let identity = h.service.run(h.request(1)).await.unwrap();
    active.entered().await.unwrap();
    active.start().await.unwrap();

    let mut replacement = h.request(2);
    replacement.source.content_hash = hash(&replacement.source.source);
    replacement.source.source = "unsaved replacement source".into();
    assert!(h
        .service
        .run(replacement)
        .await
        .unwrap_err()
        .to_string()
        .contains("differs from the saved project"));
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
    active.complete(ExecutionTerminal::TimedOut).await.unwrap();
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Failed { identity: actual, .. } if actual == identity)
    );
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn each_runtime_diagnostic_uses_only_its_own_run_snapshot() {
    let mut h = Harness::new();
    h.trust().await;
    let mut mapped = h.fake.queue_controlled().unwrap();
    let mut unmapped = h.fake.queue_controlled().unwrap();
    let mut first = h.request(1);
    let file = "file:///project/process.ts";
    first.source.instrumented_source = "++x".into();
    first.source.source_map = Some(
        serde_json::json!({
            "version": 3,
            "file": file,
            "sources": [file],
            "sourcesContent": [first.source.source],
            "mappings": "AAAA,CAAA,CAAA",
        })
        .to_string(),
    );
    let id = h.service.run(first).await.unwrap();
    let captured = mapped.entered().await.unwrap();
    mapped.start().await.unwrap();
    mapped
        .complete(ExecutionTerminal::Failed(runtime_failure_at(&captured, 3)))
        .await
        .unwrap();

    let diagnostic = loop {
        if let ScriptRunEvent::Diagnostic {
            identity,
            diagnostic,
        } = h.event().await
        {
            assert_eq!(identity, id);
            break diagnostic;
        }
    };
    assert!(
        matches!(h.event().await, ScriptRunEvent::Failed { identity, diagnostic: duplicate }
        if identity == id && duplicate == diagnostic)
    );
    let location = diagnostic.location.unwrap();
    assert_eq!(location.file, file);
    assert_eq!(
        location.range.start,
        SourcePosition {
            line: 1,
            column: 1,
            offset: 0
        }
    );

    let second = h.request(2);
    let id = h.service.run(second).await.unwrap();
    let captured = unmapped.entered().await.unwrap();
    unmapped.start().await.unwrap();
    let failure = runtime_failure_at(&captured, 3);
    unmapped
        .complete(ExecutionTerminal::Failed(failure.clone()))
        .await
        .unwrap();
    assert!(
        matches!(h.terminal().await, ScriptRunEvent::Failed { identity, diagnostic }
        if identity == id && diagnostic.location.is_none())
    );
    let raw = h.service.last_failure().unwrap().unwrap();
    assert_eq!(raw.identity, id);
    assert_eq!(raw.failure, failure);
    h.service.shutdown().await.unwrap();
}

fn runtime_failure_at(request: &ExecutionRequest, column: u32) -> ExecutionFailure {
    let entry = request
        .runs_root
        .join(&request.manifest.identity.run_id.0)
        .join("process.ts");
    ExecutionFailure {
        phase: ExecutionFailurePhase::UserRuntime,
        message: "bad run".into(),
        stack: Some("bounded raw stack".into()),
        location: Some(ExecutionLocation {
            file: entry.to_string_lossy().into(),
            line: 1,
            column,
        }),
    }
}

#[tokio::test]
async fn real_bun_runtime_and_import_locations_map_back_from_shifted_utf16_columns() {
    use crate::script::{
        bun::BunExecutor,
        bun_probe::{compilation_target_triple, prepared_sidecar_path},
    };
    let root = tempfile::tempdir().unwrap();
    let store = Arc::new(ProjectStore::new(root.path()));
    let project_id = store.create("test").unwrap().manifest.project_id;
    let bun = prepared_sidecar_path(compilation_target_triple().unwrap());
    let (sender, mut events) = mpsc::unbounded_channel();
    let service = ImageScriptService::new(
        store.clone(),
        Arc::new(BunExecutor::new(bun)),
        Arc::default(),
        Arc::new(NoResources),
        ServiceLimits::default(),
        move |event| {
            let _ = sender.send(event);
        },
    )
    .unwrap();
    service
        .trust_project(project_id.clone(), store.open(&project_id).unwrap().source)
        .await
        .unwrap();

    let prefix = "createImageProcess(() => { const unicode = '😀é'; ";
    let insertion = "void 0;";
    let file = "file:///editor/process.ts";
    for (revision, tail, token, phase) in [
        (
            1,
            "throw new Error('mapped'); });",
            "Error",
            ExecutionFailurePhase::UserRuntime,
        ),
        (
            2,
            "const value = ; });",
            "; });",
            ExecutionFailurePhase::Import,
        ),
    ] {
        let source = format!("{prefix}{tail}");
        let instrumented = format!("{prefix}{insertion}{tail}");
        let prefix_width = prefix.encode_utf16().count();
        let mut mappings = vec!["AAAA"];
        mappings.extend(std::iter::repeat_n("CAAC", prefix_width));
        mappings.extend(std::iter::repeat_n("CAAA", insertion.len()));
        mappings.extend(std::iter::repeat_n("CAAC", tail.len() - 1));
        let source_map = serde_json::json!({
            "version": 3,
            "file": file,
            "sources": [file],
            "sourcesContent": [source],
            "mappings": mappings.join(","),
        })
        .to_string();
        let original_offset = source[..source.find(token).unwrap()].encode_utf16().count() as u32;
        let source_revision = SourceRevision(revision);
        service
            .save_project(project_id.clone(), source.clone(), source_revision)
            .await
            .unwrap();
        let identity = service
            .run(RunRequest {
                project_id: project_id.clone(),
                client_request_id: ClientRequestId(format!("real-{revision}")),
                source: SourceSnapshot {
                    source_revision,
                    content_hash: String::new(),
                    source,
                    instrumented_source: instrumented,
                    source_map: Some(source_map),
                },
                value_revision: ValueRevision(1),
                input_revision: InputRevision(1),
                values: Default::default(),
                inputs: Vec::new(),
            })
            .await
            .unwrap();

        let diagnostic = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                if let ScriptRunEvent::Failed {
                    identity: actual,
                    diagnostic,
                } = events.recv().await.unwrap()
                {
                    assert_eq!(actual, identity);
                    return diagnostic;
                }
            }
        })
        .await
        .unwrap();
        let details = service.last_failure().unwrap().unwrap();
        assert_eq!(details.identity, identity);
        assert_eq!(details.failure.phase, phase);
        let raw = details.failure.location.unwrap();
        assert_eq!(raw.column, original_offset + 1 + insertion.len() as u32);
        let mapped = diagnostic.location.unwrap();
        assert_eq!(mapped.file, file);
        assert_eq!(
            mapped.range.start,
            SourcePosition {
                line: 1,
                column: original_offset + 1,
                offset: original_offset
            }
        );
    }
    service.shutdown().await.unwrap();
}

#[tokio::test]
async fn protocol_keeps_prior_projects_preview_through_replacement_and_success() {
    use tauri::http::{Request, StatusCode};

    let mut h = Harness::new();
    h.trust().await;
    let mut first = h.fake.queue_controlled().unwrap();
    let mut second = h.fake.queue_controlled().unwrap();
    h.service.run(h.request(1)).await.unwrap();
    let first_request = first.entered().await.unwrap();
    first.start().await.unwrap();
    first.complete(write_output(&first_request)).await.unwrap();
    let ScriptRunEvent::Succeeded {
        output: first_output,
        ..
    } = h.terminal().await
    else {
        panic!("expected first success");
    };

    h.project = h.store.create("second").unwrap().manifest.project_id;
    h.trust().await;
    let second_identity = h.service.run(h.request(2)).await.unwrap();
    let second_request = second.entered().await.unwrap();
    second.start().await.unwrap();
    let registry = h.service.output_registry();
    let preview = |url: &str| {
        let request = Request::builder().uri(url).body(Vec::new()).unwrap();
        super::super::protocol::respond(&registry, &request).status()
    };
    assert_eq!(preview(&first_output.preview_url), StatusCode::OK);

    second
        .complete(write_output(&second_request))
        .await
        .unwrap();
    let ScriptRunEvent::Succeeded {
        identity,
        output: second_output,
    } = h.terminal().await
    else {
        panic!("expected second success");
    };
    assert_eq!(identity, second_identity);
    assert_ne!(first_output.preview_url, second_output.preview_url);
    assert_eq!(preview(&first_output.preview_url), StatusCode::OK);
    assert_eq!(preview(&second_output.preview_url), StatusCode::OK);
    h.service.shutdown().await.unwrap();
    assert_eq!(preview(&first_output.preview_url), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn detached_save_keeps_admission_serialized_until_the_write_finishes() {
    use crate::script::project_store::{AtomicFileWriter, FsAtomicFileWriter};
    use std::path::Path;

    struct GatedWriter {
        entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
        release: Mutex<std::sync::mpsc::Receiver<()>>,
    }

    impl AtomicFileWriter for GatedWriter {
        fn replace(&self, destination: &Path, contents: &[u8]) -> Result<()> {
            if destination.ends_with("process.ts") {
                self.entered
                    .lock()
                    .unwrap()
                    .take()
                    .unwrap()
                    .send(())
                    .unwrap();
                self.release.lock().unwrap().recv()?;
            }
            FsAtomicFileWriter.replace(destination, contents)
        }
    }

    let root = tempfile::tempdir().unwrap();
    let (entered, wait_for_write) = tokio::sync::oneshot::channel();
    let (release, wait_for_release) = std::sync::mpsc::channel();
    let store = Arc::new(ProjectStore::with_writer(
        root.path(),
        Arc::new(GatedWriter {
            entered: Mutex::new(Some(entered)),
            release: Mutex::new(wait_for_release),
        }),
    ));
    let project = store.create("save").unwrap().manifest.project_id;
    let service = ImageScriptService::new(
        store.clone(),
        Arc::new(FakeExecutor::default()),
        Arc::default(),
        Arc::new(NoResources),
        ServiceLimits::default(),
        |_| {},
    )
    .unwrap();
    service
        .trust_project(project.clone(), store.open(&project).unwrap().source)
        .await
        .unwrap();

    let save = {
        let service = service.clone();
        let project = project.clone();
        tokio::spawn(async move {
            service
                .save_project(project, "updated".into(), SourceRevision(1))
                .await
        })
    };
    tokio::time::timeout(Duration::from_secs(10), wait_for_write)
        .await
        .unwrap()
        .unwrap();
    save.abort();
    assert!(save.await.unwrap_err().is_cancelled());
    assert!(service.0.scheduler.try_lock().is_err());

    release.send(()).unwrap();
    let scheduler = service.0.scheduler.lock().await;
    assert_eq!(store.open(&project).unwrap().source, "updated");
    assert_eq!(
        service
            .0
            .state()
            .unwrap()
            .trusted
            .get(&project.0)
            .map(|approval| &approval.source_hash),
        Some(&hash("updated"))
    );
    drop(scheduler);
    service.shutdown().await.unwrap();
}

#[tokio::test]
async fn a_delayed_approval_does_not_trust_newer_saved_source() {
    let h = Harness::new();
    let reviewed = h.store.open(&h.project).unwrap().source;
    let scheduler = h.service.0.scheduler.lock().await;
    let service = h.service.clone();
    let project = h.project.clone();
    let pending = tokio::spawn(async move { service.trust_project(project, reviewed).await });

    h.store.save(&h.project, "newer source").unwrap();
    drop(scheduler);
    let error = pending.await.unwrap().unwrap_err();
    assert!(error.to_string().contains("changed before approval"));
    assert!(h
        .service
        .run(h.request(1))
        .await
        .unwrap_err()
        .to_string()
        .contains("untrusted"));
    h.service.shutdown().await.unwrap();
}

#[tokio::test]
async fn real_bun_enforces_output_limits_and_paths_and_joins_on_shutdown() {
    use crate::script::{
        bun::BunExecutor,
        bun_probe::{compilation_target_triple, prepared_sidecar_path},
    };

    let mut h = Harness::new();
    let target = compilation_target_triple().expect("Bun is required for this test");
    let (send, events) = mpsc::unbounded_channel();
    h.service = ImageScriptService::new(
        h.store.clone(),
        Arc::new(BunExecutor::new(prepared_sidecar_path(target))),
        Arc::default(),
        Arc::new(NoResources),
        ServiceLimits::default(),
        move |event| {
            let _ = send.send(event);
        },
    )
    .unwrap();
    h.events = events;
    h.trust().await;

    for (revision, source, diagnostic_source, message) in [
        (
            1,
            r#"import { truncateSync, writeFileSync } from "node:fs";
                createImageProcess(() => {
                    writeFileSync("large.png", "");
                    truncateSync("large.png", 64 * 1024 * 1024 + 1);
                    return "large.png";
                });"#,
            DiagnosticSource::Runner,
            "output exceeds",
        ),
        (
            2,
            r#"createImageProcess(async () => {
                await Bun.write("result.json", JSON.stringify({
                    status: "success",
                    output: { path: "inputs/private.png", mediaType: "image/png" },
                }));
                process.exit(0);
            });"#,
            DiagnosticSource::OutputValidation,
            "outside authorized output directory",
        ),
    ] {
        h.service
            .save_project(h.project.clone(), source.into(), SourceRevision(revision))
            .await
            .unwrap();
        let mut request = h.request(revision);
        request.source.instrumented_source = source.into();
        request.source.source_map = None;
        let identity = h.service.run(request).await.unwrap();
        let ScriptRunEvent::Failed {
            identity: actual,
            diagnostic,
        } = h.terminal().await
        else {
            panic!("expected rejected Bun output");
        };
        assert_eq!(actual, identity);
        assert_eq!(diagnostic.source, diagnostic_source);
        assert!(diagnostic.message.contains(message), "{diagnostic:?}");
        assert!(h.service.last_success().unwrap().is_none());
    }

    let waiting = r#"createImageProcess(async () => {
        console.log("ready for shutdown");
        await new Promise(() => setInterval(() => {}, 1000));
    });"#;
    h.service
        .save_project(h.project.clone(), waiting.into(), SourceRevision(3))
        .await
        .unwrap();
    let mut request = h.request(3);
    request.source.instrumented_source = waiting.into();
    request.source.source_map = None;
    let identity = h.service.run(request).await.unwrap();
    loop {
        match h.event().await {
            ScriptRunEvent::Log {
                identity: actual,
                message,
                ..
            } if message.contains("ready for shutdown") => {
                assert_eq!(identity, actual);
                break;
            }
            ScriptRunEvent::Failed { diagnostic, .. } => {
                panic!("Bun failed before shutdown: {diagnostic:?}")
            }
            _ => {}
        }
    }
    h.service.shutdown().await.unwrap();
    assert!(matches!(
        h.terminal().await,
        ScriptRunEvent::Cancelled { identity: actual, reason: CancellationReason::Shutdown }
        if actual == identity
    ));
    assert!(!h.service.0.workspace.path().exists());
    assert!(h.service.run(h.request(4)).await.is_err());
}

#[cfg(unix)]
mod package_installation {
    use super::*;
    use crate::script::packages::{
        ExpectedPackageState, ScriptDependencies, ScriptLifecycleApproval,
    };
    use std::{fs, os::unix::fs::PermissionsExt, path::Path};

    const PACKAGE: &str = "test-package";

    fn dependencies() -> ScriptDependencies {
        [(PACKAGE.to_owned(), "1.0.0".to_owned())].into()
    }

    fn use_package_runtime(h: &mut Harness, path: PathBuf, executor: Arc<dyn ScriptExecutor>) {
        let (tx, events) = mpsc::unbounded_channel();
        h.service = ImageScriptService::new_with_package_runtime(
            h.store.clone(),
            executor,
            Arc::default(),
            Arc::new(NoResources),
            ServiceLimits::default(),
            Some(path),
            move |event| {
                let _ = tx.send(event);
            },
        )
        .unwrap();
        h.events = events;
    }

    fn fake_package_tool(root: &Path) -> PathBuf {
        let path = root.join("fake-bun");
        fs::write(&path, r#"#!/bin/sh
set -eu
if [ "$1" = "--version" ]; then printf '1.4.3\n'; exit; fi
mode=$(cat "${0%/*}/install-mode")
if [ "$1" = pm ]; then
    test "$2" = trust
    test "$5" = test-package
    printf 'lifecycle ran\n' > node_modules/test-package/approved
    printf 'changed by Bun trust\n' > bun.lock
    printf 'changed by Bun trust\n' > package.json
    exit
fi
frozen=0
skip_scripts=0
for option; do
    case "$option" in
        --frozen-lockfile) frozen=1 ;;
        --ignore-scripts) skip_scripts=1 ;;
    esac
done
test "$skip_scripts" = 1
if [ "$mode" = blocked ]; then
    printf 'ready to cancel\n'
    while :; do sleep 10; done
fi
if [ "$frozen" = 1 ]; then
    if [ "$mode" = mismatch ]; then
        printf 'wrong lock\n' > bun.lock
    elif ! grep -q '^locked fixture$' bun.lock; then
        printf 'lockfile mismatch\n' >&2
        exit 1
    fi
else
    printf 'locked fixture\n' > bun.lock
fi
mkdir -p node_modules/test-package
if [ "$mode" = unsupported ]; then
    printf '{"name":"test-package","version":"1.0.0","os":["other-platform"]}\n' > node_modules/test-package/package.json
else
    printf '{"name":"test-package","version":"1.0.0"}\n' > node_modules/test-package/package.json
fi
"#).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        fs::write(root.join("install-mode"), "normal").unwrap();
        path
    }

    async fn fake_harness() -> Harness {
        let mut h = Harness::new();
        let tool = fake_package_tool(h._root.path());
        let executor = Arc::new(h.fake.clone());
        use_package_runtime(&mut h, tool, executor);
        h
    }

    #[tokio::test]
    async fn locked_package_restore_repairs_missing_modules_and_preserves_the_reviewed_pair() {
        let h = fake_harness().await;
        h.trust().await;
        let initial = h
            .service
            .change_dependencies(
                h.project.clone(),
                "initial".into(),
                PackageOperation::Set(dependencies()),
                Some(ExpectedPackageState { revision: None }),
                |_| {},
            )
            .await
            .unwrap();
        assert!(initial.installed);
        assert_eq!(initial.dependencies, dependencies());
        let source = h.store.open(&h.project).unwrap().source;
        assert!(h
            .service
            .trust_project(h.project.clone(), source.clone())
            .await
            .is_err());
        assert!(h
            .service
            .run(h.request(1))
            .await
            .unwrap_err()
            .to_string()
            .contains("untrusted"));
        h.service
            .trust_project_with_packages(
                h.project.clone(),
                source.clone(),
                initial.revision.clone(),
            )
            .await
            .unwrap();

        let lease = h.store.package_access(&h.project, false).unwrap();
        let generation = lease.current().unwrap().unwrap();
        let modules = generation.installed_modules().unwrap();
        // A second writer cannot replace a generation while a reader owns the cross-process lease.
        assert!(h.store.package_access(&h.project, true).is_err());
        let export = h._root.path().join("export");
        h.store.export(&h.project, &export).unwrap();
        let exported_lock = fs::read(export.join("bun.lock")).unwrap();
        assert!(export.join("package.json").is_file());
        assert!(!export.join("node_modules").exists());
        drop(lease);

        fs::write(
            modules.join(PACKAGE).join("package.json"),
            "broken cached metadata",
        )
        .unwrap();
        let corrupt = h
            .service
            .dependency_status(h.project.clone())
            .await
            .unwrap();
        assert!(!corrupt.installed);
        assert_eq!(corrupt.lock_fingerprint, initial.lock_fingerprint);

        fs::remove_dir_all(&modules).unwrap();
        let missing = h
            .service
            .dependency_status(h.project.clone())
            .await
            .unwrap();
        assert!(!missing.installed);
        assert_eq!(missing.lock_fingerprint, initial.lock_fingerprint);

        let approval = ScriptLifecycleApproval {
            lock_fingerprint: initial.lock_fingerprint.clone().unwrap(),
            packages: vec![PACKAGE.into()],
        };
        let restored = h
            .service
            .change_dependencies(
                h.project.clone(),
                "restore".into(),
                PackageOperation::Restore(Some(approval)),
                Some(ExpectedPackageState {
                    revision: initial.revision.clone(),
                }),
                |_| {},
            )
            .await
            .unwrap();
        assert_eq!(restored.lock_fingerprint, initial.lock_fingerprint);
        assert_ne!(restored.revision, initial.revision);
        let current = h.store.package_access(&h.project, false).unwrap();
        let restored_generation = current.current().unwrap().unwrap();
        assert_eq!(restored_generation.portable_files()[1].1, exported_lock);
        assert!(restored_generation
            .installed_modules()
            .unwrap()
            .join(PACKAGE)
            .join("approved")
            .is_file());
        assert!(h
            .service
            .trust_project_with_packages(h.project.clone(), source, initial.revision)
            .await
            .is_err());
        assert!(h
            .service
            .run(h.request(2))
            .await
            .unwrap_err()
            .to_string()
            .contains("untrusted"));
        drop(current);
        h.service.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn failed_lock_and_platform_checks_preserve_the_active_generation() {
        let h = fake_harness().await;
        let initial = h
            .service
            .change_dependencies(
                h.project.clone(),
                "initial".into(),
                PackageOperation::Set(dependencies()),
                Some(ExpectedPackageState { revision: None }),
                |_| {},
            )
            .await
            .unwrap();
        let stale = h
            .service
            .change_dependencies(
                h.project.clone(),
                "stale".into(),
                PackageOperation::Set(ScriptDependencies::new()),
                Some(ExpectedPackageState { revision: None }),
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(format!("{stale:#}").contains("dependencies changed before the operation"));
        assert_eq!(
            h.service
                .dependency_status(h.project.clone())
                .await
                .unwrap(),
            initial
        );
        let wrong_approval = ScriptLifecycleApproval {
            lock_fingerprint: "wrong lock".into(),
            packages: vec![PACKAGE.into()],
        };
        for (mode, operation, error) in [
            (
                "normal",
                PackageOperation::Restore(Some(wrong_approval)),
                "before lifecycle script approval",
            ),
            (
                "mismatch",
                PackageOperation::Restore(None),
                "frozen script package restore changed bun.lock",
            ),
            (
                "unsupported",
                PackageOperation::Set(dependencies()),
                "unsupported on this platform",
            ),
        ] {
            fs::write(h._root.path().join("install-mode"), mode).unwrap();
            let failure = h
                .service
                .change_dependencies(h.project.clone(), mode.into(), operation, None, |_| {})
                .await
                .unwrap_err();
            assert!(format!("{failure:#}").contains(error), "{failure:#}");
            assert_eq!(
                h.service
                    .dependency_status(h.project.clone())
                    .await
                    .unwrap(),
                initial
            );
        }
        h.service.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn package_cancellation_joins_output_and_keeps_the_previous_generation() {
        use super::super::packages::PackagePhase;

        let h = fake_harness().await;
        let initial = h
            .service
            .change_dependencies(
                h.project.clone(),
                "initial".into(),
                PackageOperation::Set(dependencies()),
                Some(ExpectedPackageState { revision: None }),
                |_| {},
            )
            .await
            .unwrap();
        fs::write(h._root.path().join("install-mode"), "blocked").unwrap();
        let service = h.service.clone();
        let project = h.project.clone();
        let (tx, mut events) = mpsc::unbounded_channel();
        let task = tokio::spawn(async move {
            service
                .change_dependencies(
                    project,
                    "cancel-me".into(),
                    PackageOperation::Restore(None),
                    None,
                    move |event| {
                        let _ = tx.send(event);
                    },
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(event) = events.recv().await {
                assert_eq!(event.operation_id, "cancel-me");
                if event
                    .message
                    .is_some_and(|line| line.contains("ready to cancel"))
                {
                    return;
                }
            }
            panic!("Bun did not report its install stage");
        })
        .await
        .unwrap();

        assert!(!h
            .service
            .cancel_dependency_install(&h.project, "wrong-operation")
            .unwrap());
        assert!(h
            .service
            .cancel_dependency_install(&h.project, "cancel-me")
            .unwrap());
        assert!(tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap()
            .is_err());
        let mut last = None;
        while let Some(event) = events.recv().await {
            last = Some(event.phase);
        }
        assert!(matches!(last, Some(PackagePhase::Cancelled)));
        assert_eq!(
            h.service
                .dependency_status(h.project.clone())
                .await
                .unwrap(),
            initial
        );
        h.service.shutdown().await.unwrap();
    }

    /// The offline suite uses a controlled child process. Run this explicitly with network access.
    #[tokio::test]
    #[ignore = "fetches a fixed package from the npm registry"]
    async fn real_bun_installs_restores_and_runs_a_locked_package() {
        use crate::script::{
            bun::BunExecutor,
            bun_probe::{compilation_target_triple, prepared_sidecar_path},
        };

        let mut h = Harness::new();
        let bun = prepared_sidecar_path(compilation_target_triple().unwrap());
        use_package_runtime(&mut h, bun.clone(), Arc::new(BunExecutor::new(bun)));
        let initial = h
            .service
            .change_dependencies(
                h.project.clone(),
                "initial".into(),
                PackageOperation::Set([("is-number".into(), "7.0.0".into())].into()),
                Some(ExpectedPackageState { revision: None }),
                |_| {},
            )
            .await
            .unwrap();
        let restored = h
            .service
            .change_dependencies(
                h.project.clone(),
                "restore".into(),
                PackageOperation::Restore(None),
                Some(ExpectedPackageState {
                    revision: initial.revision.clone(),
                }),
                |_| {},
            )
            .await
            .unwrap();
        assert_eq!(restored.lock_fingerprint, initial.lock_fingerprint);

        use base64::Engine as _;
        let fixture = base64::engine::general_purpose::STANDARD
            .encode(crate::script::output::tests::image(image::ImageFormat::Png));
        let source = r#"import isNumber from "is-number";
            createImageProcess(() => {
                if (!isNumber("42") || isNumber("not a number")) throw new Error("broken package import");
                return Uint8Array.from(atob("FIXTURE_PNG"), c => c.charCodeAt(0));
            });"#.replace("FIXTURE_PNG", &fixture);
        h.service
            .save_project(h.project.clone(), source.clone(), SourceRevision(1))
            .await
            .unwrap();
        h.service
            .trust_project_with_packages(
                h.project.clone(),
                source.clone(),
                restored.revision.clone(),
            )
            .await
            .unwrap();
        let mut request = h.request(1);
        request.source.instrumented_source = source;
        request.source.source_map = None;
        h.service.run(request).await.unwrap();
        let terminal = h.terminal().await;
        assert!(
            matches!(terminal, ScriptRunEvent::Succeeded { .. }),
            "{terminal:?}"
        );
        h.service.shutdown().await.unwrap();
    }
}
