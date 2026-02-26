use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebouncedEvent, Debouncer,
};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
use tokio::sync::Mutex;
use tokio::time::Duration;

use crate::dtp_service::{jobs::{CheckFileJob, SyncJob}, scheduler::Scheduler};

pub struct WatchService {
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    paths: Mutex<HashMap<String, bool>>,
    task: tokio::task::JoinHandle<()>,
}

impl WatchService {
    pub fn new(scheduler: Scheduler) -> Self {
        let (tx_std, rx_std) = std::sync::mpsc::channel::<Result<Vec<DebouncedEvent>, _>>();

        let watcher = new_debouncer(Duration::from_secs(2), tx_std).unwrap();

        let task = tokio::task::spawn_blocking(move || {
            for res in rx_std {
                match res {
                    Ok(events) => {
                        let mut projects: HashSet<String> = HashSet::new();
                        let mut volumes_changed = false;
                        for event in events {
                            if let Some(parent) = event.path.parent() {
                                if parent == Path::new("/Volumes") {
                                    volumes_changed = true;
                                    log::debug!("Volumes changed: {:?}", event.path);
                                }
                            }
                            match event.path.extension().and_then(|ext| ext.to_str()) {
                                Some("sqlite3") | Some("sqlite3-wal") => {
                                    let project_path = event.path.with_extension("sqlite3");
                                    projects.insert(project_path.to_str().unwrap().to_string());
                                }
                                _ => {}
                            }
                        }

                        for project in projects {
                            let job = CheckFileJob {
                                project_path: project,
                            };
                            scheduler.add_job(job);
                        }

                        if volumes_changed {
                            let job = SyncJob::new(true);
                            scheduler.add_job(job);
                        }
                    }
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            }
        });

        Self {
            watcher: Mutex::new(Some(watcher)),
            // scheduler: scheduler,
            paths: Mutex::new(HashMap::new()),
            task: task,
        }
    }

    pub async fn watch_folders(&self, paths: Vec<(String, bool)>) -> Result<(), String> {
        let mut watcher_guard = self.watcher.lock().await;
        let watcher = watcher_guard.as_mut().unwrap();
        let mut watch_paths = self.paths.lock().await;

        for (path, recursive) in paths {
            let (is_watching, is_watching_recursive) = watch_paths
                .get(&path)
                .map(|v| (*v, recursive))
                .unwrap_or((false, false));

            if is_watching {
                if is_watching_recursive == recursive {
                    continue;
                }
                stop_watch(watcher, &path);
            }

            watcher
                .watcher()
                .watch(
                    Path::new(&path),
                    match recursive {
                        true => RecursiveMode::Recursive,
                        false => RecursiveMode::NonRecursive,
                    },
                )
                .map_err(|e| e.to_string())?;

            watch_paths.insert(path, recursive);
        }
        Ok(())
    }

    pub async fn watch(&self, path: &str, recursive: bool) -> Result<(), String> {
        let mut watcher_guard = self.watcher.lock().await;
        let watcher = watcher_guard.as_mut().unwrap();
        let mut watch_paths = self.paths.lock().await;

        let (is_watching, is_watching_recursive) = watch_paths
            .get(path)
            .map(|v| (*v, recursive))
            .unwrap_or((false, false));

        if is_watching {
            if is_watching_recursive == recursive {
                return Ok(());
            }
            stop_watch(watcher, path);
        }

        watcher
            .watcher()
            .watch(
                Path::new(path),
                match recursive {
                    true => RecursiveMode::Recursive,
                    false => RecursiveMode::NonRecursive,
                },
            )
            .map_err(|e| e.to_string())?;

        watch_paths.insert(path.to_string(), recursive);
        log::debug!("Watching: {}", path);
        Ok(())
    }

    pub async fn unwatch(&self, path: &str) -> Result<(), String> {
        log::debug!("Unwatching: {}", path);
        let mut watcher_guard = self.watcher.lock().await;
        let mut watch_paths = self.paths.lock().await;
        if let Some(watcher) = watcher_guard.as_mut() {
            if watch_paths.contains_key(path) {
                stop_watch(watcher, path);
                watch_paths.remove(path);
                log::debug!("Unwatched: {}", path);
            }
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn stop_all(&self) -> Result<(), String> {
        let mut watcher_guard = self.watcher.lock().await;
        let mut watch_paths = self.paths.lock().await;
        if let Some(mut watcher) = watcher_guard.take() {
            let paths_to_stop: Vec<String> = watch_paths.keys().cloned().collect();
            for path in paths_to_stop {
                stop_watch(&mut watcher, &path);
            }
            watch_paths.clear();
        }

        self.task.abort();

        Ok(())
    }
}

fn stop_watch(watcher: &mut Debouncer<RecommendedWatcher>, path: &str) {
    let _ = watcher.watcher().unwatch(&Path::new(path));
}
