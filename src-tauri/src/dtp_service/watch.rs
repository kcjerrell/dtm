use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    collections::HashSet,
    path::Path,
    sync::{Arc, OnceLock},
};
use tokio::sync::Mutex;
use tokio::time::Duration;

use crate::dtp_service::{
    jobs::{CheckFolderJob, SyncJob},
    scheduler::Scheduler,
};

pub struct WatchService {
    watchers: Mutex<HashMap<String, FolderWatcher>>,
    stopped: AtomicBool,
    volume_watcher: OnceLock<VolumeWatcher>,
    scheduler: Arc<Scheduler>,
}

pub struct FolderWatcher {
    watcher: Mutex<Debouncer<RecommendedWatcher>>,
    path: String,
    recursive: bool,
}

impl FolderWatcher {
    pub fn new(path: String, recursive: bool, scheduler: Arc<Scheduler>) -> anyhow::Result<Self> {
        let watcher_path = path.clone();
        let runtime_handle = tokio::runtime::Handle::current();

        let watcher = new_debouncer(Duration::from_secs(2), move |res: DebounceEventResult| {
            let path = path.clone();
            let scheduler = scheduler.clone();
            runtime_handle.spawn(async move {
                match res {
                    Ok(events) => {
                        let mut projects: HashSet<String> = HashSet::new();
                        for event in events {
                            match event.path.extension().and_then(|ext| ext.to_str()) {
                                Some("sqlite3") | Some("sqlite3-wal") => {
                                    let project_path = event.path.with_extension("sqlite3");
                                    projects.insert(project_path.to_string_lossy().into_owned());
                                }
                                _ => {}
                            }
                        }

                        if !projects.is_empty() {
                            let job = CheckFolderJob::new_from_path(
                                path.clone(),
                                false,
                                false,
                                Some(projects.into_iter().collect()),
                            );
                            scheduler.add_job(job);
                        }
                    }
                    Err(e) => {
                        log::error!("Watch error for {path}: {e:?}");
                        scheduler.add_job(CheckFolderJob::new_from_path(path, false, true, None));
                    }
                }
            });
        })?;

        Ok(Self {
            watcher: Mutex::new(watcher),
            path: watcher_path,
            recursive,
        })
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        let mode = if self.recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        self.watcher
            .lock()
            .await
            .watcher()
            .watch(Path::new(&self.path), mode)?;
        Ok(())
    }

    pub async fn stop(&self) {
        let _ = self
            .watcher
            .lock()
            .await
            .watcher()
            .unwatch(Path::new(&self.path));
    }
}

pub struct VolumeWatcher {
    watcher: Mutex<Debouncer<RecommendedWatcher>>,
}

impl VolumeWatcher {
    pub fn new(scheduler: Arc<Scheduler>) -> anyhow::Result<Self> {
        let runtime_handle = tokio::runtime::Handle::current();

        let watcher = new_debouncer(Duration::from_secs(2), move |res: DebounceEventResult| {
            let scheduler = scheduler.clone();
            runtime_handle.spawn(async move {
                match res {
                    Ok(events) => {
                        let mut volumes_changed = false;
                        for event in events {
                            if let Some(parent) = event.path.parent() {
                                if parent == Path::new("/Volumes") {
                                    volumes_changed = true;
                                    log::debug!("Volumes changed: {:?}", event.path);
                                }
                            }
                        }

                        if volumes_changed {
                            let job = SyncJob::new(true);
                            scheduler.add_job(job);
                        }
                    }
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            });
        })?;

        Ok(Self {
            watcher: Mutex::new(watcher),
        })
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        if !Path::new("/Volumes").try_exists()? {
            return Ok(());
        }
        self.watcher
            .lock()
            .await
            .watcher()
            .watch(Path::new("/Volumes"), RecursiveMode::NonRecursive)?;
        Ok(())
    }

    pub async fn stop(&self) {
        if !Path::new("/Volumes").exists() {
            return;
        }
        let _ = self
            .watcher
            .lock()
            .await
            .watcher()
            .unwatch(Path::new("/Volumes"));
    }
}

impl WatchService {
    pub fn new(scheduler: Scheduler) -> Self {
        let scheduler = Arc::new(scheduler);
        let watchers = Mutex::new(HashMap::new());
        let volume_watcher = OnceLock::new();
        Self {
            watchers,
            stopped: AtomicBool::new(false),
            volume_watcher,
            scheduler,
        }
    }

    pub async fn watch_volumes(&self) -> anyhow::Result<()> {
        if self.volume_watcher.get().is_none() {
            let watcher = VolumeWatcher::new(self.scheduler.clone())?;
            let _ = self.volume_watcher.set(watcher);
        }
        if let Some(watcher) = self.volume_watcher.get() {
            watcher.start().await?;
        }
        Ok(())
    }

    pub async fn stop_watch_volumes(&self) -> anyhow::Result<()> {
        if let Some(watcher) = self.volume_watcher.get() {
            watcher.stop().await;
        }
        Ok(())
    }

    pub async fn watch_folder(&self, path: &str, recursive: bool) -> anyhow::Result<()> {
        let mut watchers = self.watchers.lock().await;
        if self.stopped.load(Ordering::Acquire) {
            return Ok(());
        }
        if watchers.get(path).is_some_and(|w| w.recursive == recursive) {
            return Ok(());
        }
        if let Some(old) = watchers.remove(path) {
            old.stop().await;
        }
        let watcher = FolderWatcher::new(path.to_owned(), recursive, self.scheduler.clone())?;
        watcher.start().await?;
        watchers.insert(path.to_owned(), watcher);
        Ok(())
    }
    pub async fn stop_watch_folder(&self, path: &str) -> anyhow::Result<()> {
        if let Some(watcher) = self.watchers.lock().await.remove(path) {
            watcher.stop().await;
        }
        Ok(())
    }
    pub async fn stop_all(&self) -> anyhow::Result<()> {
        let mut watchers = self.watchers.lock().await;
        self.stopped.store(true, Ordering::Release);
        for (_, watcher) in watchers.drain() {
            watcher.stop().await;
        }
        self.stop_watch_volumes().await?;
        Ok(())
    }
}
