use std::{path::PathBuf, sync::Arc};

use dashmap::DashMap;

use anyhow::{anyhow, Result};
use tokio::sync::OnceCell;

use crate::{dtp_service::AppHandleWrapper, projects_db::archive::dt_zip::DTZip};

static DT_ZIP_CACHE: OnceCell<DTZipCache> = OnceCell::const_new();

pub struct DTZipCache {
    cache: Arc<DashMap<String, Arc<OnceCell<Arc<DTZip>>>>>,
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

    pub async fn get_dt_zip(archive_path: &str) -> Result<Arc<DTZip>> {
        let cache = Self::get_cache()?;
        let (_, name) = archive_path.rsplit_once("/").unwrap_or(("", ""));

        // The clone here is important - otherwise the lock on the dashmap shard will be held
        // and can deadlock when this function next awaits
        let cell = cache
            .cache
            .entry(archive_path.to_owned())
            .or_insert_with(|| -> Arc<OnceCell<Arc<DTZip>>> {
                Arc::new(OnceCell::new())
            })
            .clone();

        let dt_zip = cell
            .get_or_try_init(|| async {
                Ok::<_, anyhow::Error>(Arc::new(
                    DTZip::new(archive_path, cache.temp_dir.to_str().ok_or_else(|| anyhow::anyhow!("Invalid UTF-8 path"))?).await?,
                ))
            })
            .await?;

        Ok(dt_zip.clone())
    }
}
