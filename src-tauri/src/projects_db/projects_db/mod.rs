use anyhow::{anyhow, Result};
use migration::{Migrator, MigratorTrait};
use once_cell::sync::Lazy;
use sea_orm::{Database, DatabaseConnection, SqlxSqliteConnector};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tokio::sync::RwLock;

use libsqlite3_sys::{sqlite3_auto_extension, SQLITE_OK};
use std::str::FromStr;
use std::sync::OnceLock;

mod images;
mod import;
mod mixed_error;
mod models;
mod projects;
mod watchfolders;
use crate::projects_db::dtos::{
    embedding::Embeddings,
    embedding_model::{self, EmbeddingModels},
};
pub use mixed_error::MixedError;

static REGISTER_SQLITE_VEC: OnceLock<anyhow::Result<()>> = OnceLock::new();

static PROJECTS_DB: Lazy<RwLock<Option<ProjectsDb>>> = Lazy::new(|| RwLock::new(None));

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

impl ProjectsDb {
    pub async fn new(db_path: &str) -> Result<Self> {
        register_sqlite_vec()?;

        let options = SqliteConnectOptions::from_str(db_path)?;

        let pool = SqlitePoolOptions::new().connect_with(options).await?;

        let db: DatabaseConnection = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool);

        Migrator::up(&db, None).await?;

        let projects_db = Self { db: db };

        let mut singleton = PROJECTS_DB.write().await;
        *singleton = Some(projects_db.clone());

        Ok(projects_db)
    }

    pub async fn get() -> Result<ProjectsDb> {
        let singleton = PROJECTS_DB.read().await;
        match singleton.clone() {
            Some(projects_db) => Ok(projects_db),
            None => Err(anyhow!("DB not ready")),
        }
    }

    pub fn embedding_models(&self) -> EmbeddingModels<'_> {
        EmbeddingModels::new(self)
    }

    pub fn embeddings(&self) -> Embeddings<'_> {
        Embeddings::new(self)
    }
}

fn register_sqlite_vec() -> anyhow::Result<()> {
    match REGISTER_SQLITE_VEC.get_or_init(|| {
        let result = unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )))
        };

        if result == SQLITE_OK {
            Ok(())
        } else {
            anyhow::bail!("failed to register sqlite-vec extension: {result}")
        }
    }) {
        Ok(()) => Ok(()),
        Err(e) => Err(anyhow::anyhow!(e.to_string())),
    }
}
