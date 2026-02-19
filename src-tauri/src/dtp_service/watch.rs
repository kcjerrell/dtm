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

use crate::dtp_service::{jobs::CheckFileJob, scheduler::Scheduler};

pub struct WatchService {
    watcher: Mutex<Debouncer<RecommendedWatcher>>,
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
                        for event in events {
                            match event.path.extension().unwrap().to_str().unwrap() {
                                "sqlite3" | "sqlite3-wal" => {
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
                    }
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            }
        });

        Self {
            watcher: Mutex::new(watcher),
            // scheduler: scheduler,
            paths: Mutex::new(HashMap::new()),
            task: task,
        }
    }

    pub async fn watch_folders(&self, paths: Vec<(String, bool)>) -> Result<(), String> {
        let mut watcher = self.watcher.lock().await;
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
                stop_watch(&mut watcher, &path);
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

    pub async fn stop_all(&self) -> Result<(), String> {
        let mut watcher = self.watcher.lock().await;
        let mut watch_paths = self.paths.lock().await;

        for (path, _) in watch_paths.drain() {
            stop_watch(&mut watcher, &path);
        }

        Ok(())
    }
}

fn stop_watch(watcher: &mut Debouncer<RecommendedWatcher>, path: &str) {
    let _ = watcher.watcher().unwatch(&Path::new(path));
}
