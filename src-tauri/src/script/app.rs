//! Tauri composition root for image scripting.
use std::sync::Arc;

use anyhow::{Context, Result};
use tauri::{Emitter, Manager};

use crate::dtp_service::DTPService;

use super::{
    bun::BunExecutor,
    bun_probe::{bundled_sidecar_path, compilation_target_triple, prepared_sidecar_path},
    input::InputApprovals,
    project_store::ProjectStore,
    selection::DrawThingsInputs,
    service::{ImageScriptService, ServiceLimits},
    types::ScriptRunEvent,
};

/// Typed payloads are emitted by a single FIFO consumer. The webview must
/// subscribe before submitting a run and correlate by the full event identity.
const RUN_EVENT: &str = "script-run-event";

struct RunEventForwarder(tauri::async_runtime::JoinHandle<()>);

pub fn register(app: &tauri::App, projects: DTPService) -> Result<()> {
    let path = if cfg!(dev) {
        prepared_sidecar_path(
            compilation_target_triple()
                .context("Bun is unavailable for this development target")?,
        )
    } else {
        let executable = std::env::current_exe().context("failed to locate the DTM executable")?;
        bundled_sidecar_path(&executable)?
    };
    let store = Arc::new(ProjectStore::new(app.path().app_data_dir()?));
    let approvals = Arc::new(InputApprovals::default());
    let resources = Arc::new(DrawThingsInputs::new(projects));
    let (sender, mut events) = tokio::sync::mpsc::unbounded_channel::<ScriptRunEvent>();
    let service = ImageScriptService::new_with_package_runtime(
        store.clone(),
        Arc::new(BunExecutor::new(path.clone())),
        approvals.clone(),
        resources.clone(),
        ServiceLimits::default(),
        Some(path),
        move |event| {
            let _ = sender.send(event);
        },
    )
    .context("failed to initialize the image script service")?;

    let handle = app.handle().clone();
    let forwarder = tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let Err(error) = handle.emit_to("main", RUN_EVENT, event) {
                log::warn!("Failed to emit script run event: {error}");
            }
        }
    });
    app.manage(RunEventForwarder(forwarder));
    app.manage(store);
    app.manage(approvals);
    app.manage(resources);
    app.manage(service);
    Ok(())
}

pub fn shutdown(app: &tauri::AppHandle) -> Result<()> {
    let service = app.state::<ImageScriptService>();
    let result = tauri::async_runtime::block_on(service.shutdown());
    app.state::<RunEventForwarder>().0.abort();
    result
}
