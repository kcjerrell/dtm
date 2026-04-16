use dashmap::DashMap;
use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use std::{
    collections::HashSet,
    path::Path,
    sync::{Arc, OnceLock},
};
use tokio::time::Duration;
use tokio::{fs, sync::Mutex};

use crate::dtp_service::{
    jobs::{CheckFolderJob, SyncJob},
    scheduler::Scheduler,
};

pub struct WatchService {
    watchers: DashMap<String, FolderWatcher>,
    volume_watcher: OnceLock<VolumeWatcher>,
    scheduler: Arc<Scheduler>,
}

pub struct FolderWatcher {
    watcher: Mutex<Debouncer<RecommendedWatcher>>,
    path: String,
    recursive: bool,
}

impl FolderWatcher {
    pub fn new(path: String, recursive: bool, scheduler: Arc<Scheduler>) -> Self {
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
                                    projects.insert(project_path.to_str().unwrap().to_string());
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
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            });
        })
        .unwrap();

        Self {
            watcher: Mutex::new(watcher),
            path: watcher_path,
            recursive,
        }
    }

    pub async fn start(&self) {
        let exists = fs::try_exists(&self.path).await.unwrap_or(false);
        if !exists {
            return;
        }

        let recursive_mode = match self.recursive {
            true => RecursiveMode::Recursive,
            false => RecursiveMode::NonRecursive,
        };

        let _ = self
            .watcher
            .lock()
            .await
            .watcher()
            .watch(Path::new(&self.path), recursive_mode);
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
    pub fn new(scheduler: Arc<Scheduler>) -> Self {
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
        })
        .unwrap();

        Self {
            watcher: Mutex::new(watcher),
        }
    }

    pub async fn start(&self) {
        self.watcher
            .lock()
            .await
            .watcher()
            .watch(Path::new("/Volumes"), RecursiveMode::NonRecursive)
            .unwrap();
    }

    pub async fn stop(&self) {
        self.watcher
            .lock()
            .await
            .watcher()
            .unwatch(Path::new("/Volumes"))
            .unwrap();
    }
}

impl WatchService {
    pub fn new(scheduler: Scheduler) -> Self {
        let scheduler = Arc::new(scheduler);
        let watchers = DashMap::new();
        let volume_watcher = OnceLock::new();
        Self {
            watchers,
            volume_watcher,
            scheduler,
        }
    }

    pub async fn watch_volumes(&self) -> Result<(), String> {
        let volume_watcher = self
            .volume_watcher
            .get_or_init(|| VolumeWatcher::new(self.scheduler.clone()));
        volume_watcher.start().await;
        Ok(())
    }

    pub async fn stop_watch_volumes(&self) -> Result<(), String> {
        let volume_watcher = self.volume_watcher.get().unwrap();
        volume_watcher.stop().await;
        Ok(())
    }

    pub async fn watch_folder(&self, path: &str, recursive: bool) -> Result<(), String> {
        let watcher = self.watchers.entry(path.to_string()).or_insert_with(|| {
            FolderWatcher::new(path.to_string(), recursive, self.scheduler.clone())
        });
        watcher.start().await;
        Ok(())
    }

    pub async fn stop_watch_folder(&self, path: &str) -> Result<(), String> {
        let watcher = match self.watchers.get(path) {
            Some(watcher) => watcher,
            None => return Ok(()),
        };
        watcher.stop().await;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn stop_all(&self) -> Result<(), String> {
        Ok(())
    }
}
