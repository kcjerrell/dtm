use std::{ffi::OsString, fs, path::Path, sync::Arc};

use anyhow::{bail, Context, Result};
use serde::Serialize;
use tokio::{process::Command, sync::watch};

use super::{ImageScriptService, Inner};
use crate::script::{
    bun::run_package_command,
    bun_probe::validate_version,
    packages::{
        read_file, stamp_modules, validate_dependencies, write_manifest, ExpectedPackageState,
        PackageAccess, ScriptDependencies, ScriptDependencyStatus, ScriptLifecycleApproval,
    },
    types::ProjectId,
};

pub(super) struct PackageJob {
    pub(super) project: ProjectId,
    id: String,
    published: bool,
    pub(super) cancel: watch::Sender<bool>,
    pub(super) done: watch::Receiver<bool>,
}

pub(crate) enum PackageOperation {
    Set(ScriptDependencies),
    Restore(Option<ScriptLifecycleApproval>),
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PackagePhase {
    Preparing,
    Installing,
    LifecycleScripts,
    Verifying,
    Complete,
    Cancelled,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PackageProgress {
    pub(super) operation_id: String,
    pub(super) phase: PackagePhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) message: Option<String>,
}

struct Reporter {
    id: String,
    sink: Arc<dyn Fn(PackageProgress) + Send + Sync>,
}

impl Reporter {
    fn emit(&self, phase: PackagePhase, message: Option<String>) {
        (self.sink)(PackageProgress {
            operation_id: self.id.clone(),
            phase,
            message,
        });
    }

    async fn run(
        self: &Arc<Self>,
        command: Command,
        phase: PackagePhase,
        cancelled: &watch::Receiver<bool>,
    ) -> Result<()> {
        self.emit(phase, None);
        let reporter = self.clone();
        run_package_command(
            command,
            cancelled.clone(),
            Arc::new(move |log| {
                if !log.text.is_empty() {
                    reporter.emit(phase, Some(log.text));
                }
            }),
        )
        .await
    }
}

impl ImageScriptService {
    pub(crate) async fn dependency_status(
        &self,
        project: ProjectId,
    ) -> Result<ScriptDependencyStatus> {
        let store = self.0.store.clone();
        tokio::task::spawn_blocking(move || {
            let packages = store.package_access(&project, false)?;
            Ok(packages
                .current()?
                .map(|generation| generation.status())
                .unwrap_or_default())
        })
        .await
        .context("script dependency status worker failed")?
    }

    pub(crate) async fn change_dependencies(
        &self,
        project: ProjectId,
        operation_id: String,
        operation: PackageOperation,
        expected_state: Option<ExpectedPackageState>,
        progress: impl Fn(PackageProgress) + Send + Sync + 'static,
    ) -> Result<ScriptDependencyStatus> {
        if operation_id.is_empty() || operation_id.len() > 128 {
            bail!("invalid script package operation ID");
        }
        if let PackageOperation::Set(dependencies) = &operation {
            validate_dependencies(dependencies)?;
        }

        let inner = self.0.clone();
        let bun = inner
            .package_bun
            .clone()
            .context("script package runtime is unavailable")?;
        let (cancel, cancelled) = watch::channel(false);
        let (done, completion) = watch::channel(false);
        let reporter = Arc::new(Reporter {
            id: operation_id.clone(),
            sink: Arc::new(progress),
        });
        {
            // The run scheduler orders registration with pending/admitted script requests.
            let _scheduler = inner.scheduler.lock().await;
            let mut state = inner.state()?;
            if state.closed {
                bail!("script service is shut down");
            }
            if state.package_job.is_some() {
                bail!("another script package installation is active");
            }
            if state
                .active
                .as_ref()
                .is_some_and(|run| run.identity.project_id == project)
            {
                bail!("stop the project's active script before changing packages");
            }
            state.package_job = Some(PackageJob {
                project: project.clone(),
                id: operation_id,
                published: false,
                cancel,
                done: completion,
            });
        }

        tokio::spawn(async move {
            reporter.emit(PackagePhase::Preparing, None);
            let result = inner
                .install_dependencies(
                    &project,
                    operation,
                    expected_state,
                    &bun,
                    &reporter,
                    &cancelled,
                )
                .await;
            let phase = {
                let mut state = inner.state()?;
                state.package_job.take();
                match &result {
                    Ok(_) => PackagePhase::Complete,
                    Err(_) if *cancelled.borrow() => PackagePhase::Cancelled,
                    Err(_) => PackagePhase::Failed,
                }
            };
            reporter.emit(
                phase,
                result.as_ref().err().map(|error| format!("{error:#}")),
            );
            done.send_replace(true);
            result
        })
        .await
        .context("script package installation worker failed")?
    }

    pub(crate) fn cancel_dependency_install(
        &self,
        project: &ProjectId,
        operation_id: &str,
    ) -> Result<bool> {
        let state = self.0.state()?;
        Ok(state.package_job.as_ref().is_some_and(|job| {
            &job.project == project
                && job.id == operation_id
                && !job.published
                && !job.cancel.send_replace(true)
        }))
    }
}

impl Inner {
    async fn install_dependencies(
        self: &Arc<Self>,
        project: &ProjectId,
        operation: PackageOperation,
        expected_state: Option<ExpectedPackageState>,
        bun: &Path,
        reporter: &Arc<Reporter>,
        cancelled: &watch::Receiver<bool>,
    ) -> Result<ScriptDependencyStatus> {
        let store = self.store.clone();
        let access = {
            let project = project.clone();
            tokio::task::spawn_blocking(move || {
                let access = store.package_access(&project, true)?;
                if let Some(expected) = expected_state {
                    let revision = access.current()?.map(|generation| generation.revision());
                    if revision != expected.revision {
                        bail!("script dependencies changed before the operation started; review them and try again");
                    }
                }
                Ok(access)
            })
                .await
                .context("script package lock worker failed")??
        };

        let stage = match operation {
            PackageOperation::Set(dependencies) if dependencies.is_empty() => None,
            operation => Some(prepare_stage(&access, operation, bun, reporter, cancelled).await?),
        };
        reporter.emit(PackagePhase::Verifying, None);
        let inner = self.clone();
        let project = project.clone();
        let cancelled = cancelled.clone();
        let (status, obsolete) = tokio::task::spawn_blocking(move || {
            let mut state = inner.state()?;
            if state.closed || *cancelled.borrow() {
                bail!("script package installation cancelled");
            }
            let no_change = stage.is_none() && matches!(access.current(), Ok(None));
            let (status, obsolete) = access.publish(stage)?;
            if !no_change {
                // Installed code can change even when the source does not.
                state.trusted.remove(&project.0);
            }
            if let Some(job) = state.package_job.as_mut() {
                job.published = true;
            }
            Ok((status, obsolete))
        })
        .await
        .context("script package publication worker failed")??;
        if let Some(obsolete) = obsolete {
            if let Err(error) = tokio::fs::remove_dir_all(obsolete).await {
                log::warn!("Failed to remove superseded script package generation: {error}");
            }
        }
        Ok(status)
    }
}

async fn prepare_stage(
    access: &PackageAccess,
    operation: PackageOperation,
    bun: &Path,
    reporter: &Arc<Reporter>,
    cancelled: &watch::Receiver<bool>,
) -> Result<tempfile::TempDir> {
    let stage = access.stage()?;
    let staged = stage.path();
    let frozen = match operation {
        PackageOperation::Set(dependencies) => {
            write_manifest(staged, dependencies)?;
            None
        }
        PackageOperation::Restore(approval) => {
            let generation = access
                .current()?
                .context("script project has no locked dependencies")?;
            let approved = approval
                .as_ref()
                .map(|value| generation.approved_packages(value))
                .transpose()?;
            for (name, bytes) in generation.portable_files() {
                fs::write(staged.join(name), bytes)?;
            }
            Some((generation, approved))
        }
    };
    // A fresh transaction-local cache keeps installs independent of ambient or corrupt Bun caches.
    let scratch = tempfile::Builder::new()
        .prefix("dtm-script-package-bun-")
        .tempdir()?;
    let config = scratch.path().join("bunfig.toml");
    fs::write(&config, "")?;
    let mut config_arg = OsString::from("--config=");
    config_arg.push(&config);
    let command = || {
        let mut command = Command::new(bun);
        command
            .current_dir(staged)
            .env_clear()
            .env("HOME", scratch.path())
            .env("XDG_CONFIG_HOME", scratch.path())
            .env("BUN_INSTALL_CACHE_DIR", scratch.path().join("cache"))
            .env("TMPDIR", scratch.path())
            .env("PATH", "/usr/bin:/bin");
        command
    };
    validate_version(bun)
        .await
        .context("pinned Bun is unavailable for installing script packages")?;
    let mut install = command();
    install
        .args([
            "install",
            "--ignore-scripts",
            "--save-text-lockfile",
            "--backend=copyfile",
            "--linker=hoisted",
            "--no-progress",
            "--no-env-file",
            "--registry=https://registry.npmjs.org",
        ])
        .arg(&config_arg);
    if frozen.is_some() {
        install.arg("--frozen-lockfile");
    }
    reporter
        .run(install, PackagePhase::Installing, cancelled)
        .await?;

    if let Some((generation, approved)) = frozen {
        for (name, bytes) in generation.portable_files() {
            let actual = read_file(&staged.join(name), bytes.len() as u64)?;
            if actual != bytes {
                bail!("frozen script package restore changed {name}");
            }
        }
        if let Some(approved) = approved {
            generation.verify_staged_modules(staged)?;
            // Bun's explicit name allowance applies to all locked copies of each approved name.
            // No trust decisions are retained in the portable files.
            let mut trust = command();
            trust
                .args(["pm", "trust", "--no-env-file"])
                .arg(&config_arg)
                .args(approved);
            reporter
                .run(trust, PackagePhase::LifecycleScripts, cancelled)
                .await?;
            for (name, bytes) in generation.portable_files() {
                let path = staged.join(name);
                fs::remove_file(&path)?;
                fs::write(path, bytes)?;
            }
        }
    }
    stamp_modules(staged)?;
    Ok(stage)
}
