use crate::dtp_service::archive::DTZip;
use anyhow::Context;
use dashmap::DashMap;
use once_cell::sync::Lazy;
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::OnceCell;

use super::core::DTProject;

/// TTL for cached projects. After this duration of no access, the project is evicted.
const CACHE_TTL: Duration = Duration::from_secs(3);
/// Grace period after removing from cache before closing the pool,
/// allowing in-flight queries to complete.
const DRAIN_GRACE: Duration = Duration::from_millis(500);

static PROJECT_CACHE: Lazy<DashMap<String, Arc<OnceCell<Arc<CachedProject>>>>> =
    Lazy::new(DashMap::new);

struct CachedProject {
    project: Arc<DTProject>,
    generation: AtomicU64,
}

pub async fn close_folder(folder_path: &str) {
    let to_remove: Vec<String> = PROJECT_CACHE
        .iter()
        .filter(|entry| entry.key().starts_with(folder_path))
        .map(|entry| entry.key().clone())
        .collect();

    for key in to_remove {
        if let Some((_, cell)) = PROJECT_CACHE.remove(&key) {
            if let Some(cached) = cell.get() {
                let pool = cached.project.pool.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(DRAIN_GRACE).await;
                    pool.close().await;
                });
            }
        }
    }
}

fn schedule_eviction(path: String, generation: u64) {
    tokio::spawn(async move {
        tokio::time::sleep(CACHE_TTL).await;

        // Only evict if no one has accessed it since we were scheduled
        let should_evict = PROJECT_CACHE
            .get(&path)
            .and_then(|cell| {
                cell.get()
                    .map(|c| c.generation.load(Ordering::Relaxed) == generation)
            })
            .unwrap_or(false);

        if should_evict {
            if let Some((_, cell)) = PROJECT_CACHE.remove(&path) {
                if let Some(cached) = cell.get() {
                    let pool = cached.project.pool.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(DRAIN_GRACE).await;
                        pool.close().await;
                    });
                }
            }
        }
    });
}

impl DTProject {
    /// Creates a standalone DTProject that bypasses the cache and eviction system.
    /// Use this for long-running operations (e.g. scan_project) where the caller
    /// manages the lifetime directly. The pool closes when the DTProject is dropped.
    pub async fn open(path: &str) -> anyhow::Result<DTProject> {
        let mut dt_project = DTProject::new(path, false, None)
            .await
            .with_context(|| format!("failed to open standalone project database at {}", path))?;
        dt_project.is_shared = false;
        Ok(dt_project)
    }

    pub(crate) async fn open_archive(dt_zip: Arc<DTZip>) -> anyhow::Result<DTProject> {
        let db_path = dt_zip.db_path.clone();
        DTProject::new(&db_path, false, Some(dt_zip))
            .await
            .with_context(|| format!("failed to open archived project database at {}", db_path))
    }

    pub async fn open_mut(path: &str) -> anyhow::Result<DTProject> {
        let mut dt_project = Self::open(path).await?;
        dt_project.allow_mutate = true;
        Ok(dt_project)
    }

    pub async fn get(path: &str) -> anyhow::Result<Arc<DTProject>> {
        Self::get_internal(path, None).await
    }

    pub(crate) async fn get_archive(dt_zip: Arc<DTZip>) -> anyhow::Result<Arc<DTProject>> {
        Self::get_internal(&dt_zip.db_path.to_owned(), Some(dt_zip)).await
    }

    async fn get_internal(
        path: &str,
        dt_zip: Option<Arc<DTZip>>,
    ) -> anyhow::Result<Arc<DTProject>> {
        let cell = PROJECT_CACHE
            .entry(path.to_string())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone();

        let result = cell
            .get_or_try_init(|| async {
                let project =
                    Arc::new(DTProject::new(path, true, dt_zip).await.with_context(|| {
                        format!("failed to initialize cached project at {}", path)
                    })?);
                Ok::<Arc<CachedProject>, anyhow::Error>(Arc::new(CachedProject {
                    project,
                    generation: AtomicU64::new(0),
                }))
            })
            .await;

        match result {
            Ok(cached) => {
                let gen = cached.generation.fetch_add(1, Ordering::Relaxed) + 1;
                schedule_eviction(path.to_string(), gen);
                Ok(cached.project.clone())
            }
            Err(e) => {
                // Remove the empty OnceCell so the next caller retries fresh
                PROJECT_CACHE.remove(path);
                Err(e)
            }
        }
    }
}
