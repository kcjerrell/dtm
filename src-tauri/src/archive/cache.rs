use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use dashmap::DashMap;

use anyhow::{anyhow, Result};
use tokio::sync::OnceCell;

use crate::dtp_service::AppHandleWrapper;

use super::DTZip;

static DT_ZIP_CACHE: OnceCell<DTZipCache> = OnceCell::const_new();
/// Archive readers retain file descriptors and may own a materialized database, so keep the
/// process-wide cache bounded. Evicted generations remain alive while a caller holds an Arc.
const MAX_CACHED_ARCHIVES: usize = 32;

pub struct DTZipCache {
    cache: Arc<DashMap<String, Arc<OnceCell<Arc<DTZip>>>>>,
    access: Arc<DashMap<String, u64>>,
    access_clock: AtomicU64,
    temp_dir: PathBuf,
}

impl DTZipCache {
    pub async fn init(app: AppHandleWrapper) -> Result<()> {
        DT_ZIP_CACHE
            .get_or_try_init(|| async {
                let temp_dir = app.get_temp_dir()?.join("archive_db");
                std::fs::create_dir_all(&temp_dir)?;

                Ok::<Self, anyhow::Error>(Self {
                    cache: Arc::new(DashMap::new()),
                    access: Arc::new(DashMap::new()),
                    access_clock: AtomicU64::new(0),
                    temp_dir,
                })
            })
            .await?;
        Ok(())
    }

    fn get_cache() -> Result<&'static DTZipCache> {
        DT_ZIP_CACHE
            .get()
            .ok_or(anyhow!("Archive db cache has not yet been initialized!"))
    }

    async fn open_archive(cache: &DTZipCache, archive_path: &str) -> Result<Arc<DTZip>> {
        Ok(Arc::new(
            DTZip::new(
                archive_path,
                cache
                    .temp_dir
                    .to_str()
                    .ok_or_else(|| anyhow!("Invalid UTF-8 path"))?,
            )
            .await?,
        ))
    }

    pub async fn get_dt_zip(archive_path: &str) -> Result<Arc<DTZip>> {
        let cache = Self::get_cache()?;

        // The clone here is important - otherwise the lock on the dashmap shard will be held
        // and can deadlock when this function next awaits
        let cell = cache
            .cache
            .entry(archive_path.to_owned())
            .or_insert_with(|| -> Arc<OnceCell<Arc<DTZip>>> { Arc::new(OnceCell::new()) })
            .clone();

        let dt_zip = match cell
            .get_or_try_init(|| async { Self::open_archive(cache, archive_path).await })
            .await
        {
            Ok(dt_zip) => dt_zip,
            Err(error) => {
                let removed = cache
                    .cache
                    .remove_if(archive_path, |_, current| Arc::ptr_eq(current, &cell));
                if removed.is_some() {
                    cache.access.remove(archive_path);
                }
                return Err(error);
            }
        };

        let dt_zip = dt_zip.clone();
        Self::touch_and_trim(cache, archive_path).await;
        Ok(dt_zip)
    }

    /// Opens a new archive generation without making it visible to ordinary readers.
    /// Callers can validate and reconcile it before atomically publishing it with `replace`.
    pub async fn open_fresh(archive_path: &str) -> Result<Arc<DTZip>> {
        Self::open_archive(Self::get_cache()?, archive_path).await
    }

    /// Publishes a validated archive generation. Readers that already cloned the previous
    /// generation can finish using it; new readers observe the replacement.
    pub async fn replace(archive_path: &str, replacement: Arc<DTZip>) -> Result<()> {
        let cache = Self::get_cache()?;
        let cell = Arc::new(OnceCell::new());
        cell.set(replacement)
            .map_err(|_| anyhow!("replacement archive cell was already initialized"))?;
        let previous = cache.cache.insert(archive_path.to_owned(), cell);
        Self::close_cached_project(previous).await;
        Self::touch_and_trim(cache, archive_path).await;
        Ok(())
    }

    pub async fn invalidate(archive_path: &str) -> Result<()> {
        let Some(cache) = DT_ZIP_CACHE.get() else {
            return Ok(());
        };
        let previous = cache.cache.remove(archive_path).map(|(_, cell)| cell);
        cache.access.remove(archive_path);
        Self::close_cached_project(previous).await;
        Ok(())
    }

    pub async fn close_folder(folder_path: &str) -> Result<()> {
        let Some(cache) = DT_ZIP_CACHE.get() else {
            return Ok(());
        };
        let paths: Vec<String> = cache
            .cache
            .iter()
            .filter(|entry| Path::new(entry.key()).starts_with(folder_path))
            .map(|entry| entry.key().clone())
            .collect();
        for path in paths {
            let previous = cache.cache.remove(&path).map(|(_, cell)| cell);
            cache.access.remove(&path);
            Self::close_cached_project(previous).await;
        }
        Ok(())
    }

    pub async fn clear() -> Result<()> {
        let Some(cache) = DT_ZIP_CACHE.get() else {
            return Ok(());
        };
        let entries: Vec<_> = cache
            .cache
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        cache.cache.clear();
        cache.access.clear();
        for entry in entries {
            Self::close_cached_project(Some(entry)).await;
        }
        Ok(())
    }

    async fn close_cached_project(cell: Option<Arc<OnceCell<Arc<DTZip>>>>) {
        if let Some(dt_zip) = cell.as_ref().and_then(|cell| cell.get()) {
            crate::dt_project::close_path(&dt_zip.db_path).await;
        }
    }

    async fn touch_and_trim(cache: &DTZipCache, archive_path: &str) {
        let access = cache.access_clock.fetch_add(1, Ordering::Relaxed) + 1;
        cache.access.insert(archive_path.to_owned(), access);
        let remove_count = cache.cache.len().saturating_sub(MAX_CACHED_ARCHIVES);
        if remove_count == 0 {
            return;
        }
        let mut candidates: Vec<_> = cache
            .cache
            .iter()
            .filter(|entry| entry.key().as_str() != archive_path)
            .map(|entry| {
                let access = cache
                    .access
                    .get(entry.key())
                    .map(|value| *value)
                    .unwrap_or(0);
                (entry.key().clone(), access)
            })
            .collect();
        candidates.sort_unstable_by_key(|(_, access)| *access);
        for (path, _) in candidates.into_iter().take(remove_count) {
            let previous = cache.cache.remove(&path).map(|(_, cell)| cell);
            cache.access.remove(&path);
            Self::close_cached_project(previous).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::*;

    static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    fn write_zip(path: &Path, value: &[u8]) -> Result<()> {
        let file = std::fs::File::create(path)?;
        let mut zip = ZipWriter::new(file);
        zip.start_file("project.dtm", SimpleFileOptions::default())?;
        zip.write_all(b"database")?;
        zip.start_file("thumbhalf/1.jpg", SimpleFileOptions::default())?;
        zip.write_all(value)?;
        zip.finish()?;
        Ok(())
    }

    #[tokio::test]
    async fn replacement_publishes_one_generation_and_preserves_active_readers() -> Result<()> {
        let _guard = TEST_MUTEX.lock().await;
        DTZipCache::init(AppHandleWrapper::new(None)).await?;
        let dir = tempdir()?;
        let archive_path = dir.path().join("generation.dtm.zip");
        let staged_path = dir.path().join("generation.next");
        write_zip(&archive_path, b"old")?;
        let path = archive_path.to_string_lossy();

        DTZipCache::invalidate(&path).await?;
        let old = DTZipCache::get_dt_zip(&path).await?;
        assert_eq!(old.get_file("thumbhalf/1.jpg").await?, b"old");
        assert_eq!(tokio::fs::metadata(&old.db_path).await?.len(), 0);

        write_zip(&staged_path, b"new")?;
        std::fs::rename(&staged_path, &archive_path)?;
        let replacement = DTZipCache::open_fresh(&path).await?;
        assert_eq!(replacement.get_file("thumbhalf/1.jpg").await?, b"new");
        assert_eq!(tokio::fs::metadata(&replacement.db_path).await?.len(), 0);
        DTZipCache::replace(&path, replacement.clone()).await?;

        let current = DTZipCache::get_dt_zip(&path).await?;
        assert!(Arc::ptr_eq(&current, &replacement));
        assert_eq!(current.get_file("thumbhalf/1.jpg").await?, b"new");
        assert_eq!(old.get_file("thumbhalf/1.jpg").await?, b"old");
        assert_ne!(old.db_path, current.db_path);

        let old_db = old.db_path.clone();
        drop(old);
        assert!(!tokio::fs::try_exists(old_db).await?);
        let current_db = current.db_path.clone();
        DTZipCache::invalidate(&path).await?;
        drop(current);
        drop(replacement);
        assert!(!tokio::fs::try_exists(current_db).await?);
        Ok(())
    }

    #[tokio::test]
    async fn failed_replacement_does_not_publish_over_working_generation() -> Result<()> {
        let _guard = TEST_MUTEX.lock().await;
        DTZipCache::init(AppHandleWrapper::new(None)).await?;
        let dir = tempdir()?;
        let archive_path = dir.path().join("failed-generation.dtm.zip");
        let staged_path = dir.path().join("failed-generation.next");
        write_zip(&archive_path, b"working")?;
        let path = archive_path.to_string_lossy();

        DTZipCache::invalidate(&path).await?;
        let current = DTZipCache::get_dt_zip(&path).await?;
        std::fs::write(&staged_path, b"not a zip")?;
        std::fs::rename(&staged_path, &archive_path)?;
        assert!(DTZipCache::open_fresh(&path).await.is_err());
        assert!(Arc::ptr_eq(&current, &DTZipCache::get_dt_zip(&path).await?));
        assert_eq!(current.get_file("thumbhalf/1.jpg").await?, b"working");
        DTZipCache::invalidate(&path).await?;
        Ok(())
    }

    #[tokio::test]
    async fn failed_initial_open_is_removed_and_retryable() -> Result<()> {
        let _guard = TEST_MUTEX.lock().await;
        DTZipCache::init(AppHandleWrapper::new(None)).await?;
        let dir = tempdir()?;
        let path = dir.path().join("retry.dtm.zip");
        std::fs::write(&path, b"not a zip")?;
        let path = path.to_string_lossy();

        assert!(DTZipCache::get_dt_zip(&path).await.is_err());
        assert!(!DTZipCache::get_cache()?.cache.contains_key(path.as_ref()));
        write_zip(Path::new(path.as_ref()), b"working")?;
        assert_eq!(
            DTZipCache::get_dt_zip(&path)
                .await?
                .get_file("thumbhalf/1.jpg")
                .await?,
            b"working"
        );
        DTZipCache::invalidate(&path).await?;
        Ok(())
    }

    #[tokio::test]
    async fn access_to_many_archives_keeps_the_reader_cache_bounded() -> Result<()> {
        let _guard = TEST_MUTEX.lock().await;
        DTZipCache::init(AppHandleWrapper::new(None)).await?;
        let dir = tempdir()?;
        for index in 0..(MAX_CACHED_ARCHIVES + 8) {
            let path = dir.path().join(format!("bounded-{index}.dtm.zip"));
            write_zip(&path, b"thumbnail")?;
            DTZipCache::get_dt_zip(path.to_string_lossy().as_ref()).await?;
        }
        let cache = DTZipCache::get_cache()?;
        assert!(cache.cache.len() <= MAX_CACHED_ARCHIVES);
        DTZipCache::close_folder(dir.path().to_string_lossy().as_ref()).await?;
        Ok(())
    }
}
