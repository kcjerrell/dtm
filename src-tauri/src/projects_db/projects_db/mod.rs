use anyhow::{anyhow, Context, Result};
use migration::{Migrator, MigratorTrait};
use once_cell::sync::Lazy;
use sea_orm::{Database, DatabaseConnection};
use tokio::sync::RwLock;

mod images;
mod import;
mod mixed_error;
mod models;
mod projects;
mod watchfolders;
pub use mixed_error::MixedError;

static PROJECTS_DB: Lazy<RwLock<Option<ProjectsDb>>> = Lazy::new(|| RwLock::new(None));

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

impl ProjectsDb {
    pub async fn new(db_path: &str) -> Result<Self> {
        let db = Database::connect(db_path)
            .await
            .with_context(|| format!("failed to connect to database at '{db_path}'"))?;
        Migrator::up(&db, None)
            .await
            .with_context(|| format!("failed to run database migrations on '{db_path}'"))?;

        let projects_db = Self { db };

        let mut singleton = PROJECTS_DB.write().await;
        *singleton = Some(projects_db.clone());

        Ok(projects_db)
    }

    pub async fn get() -> Result<ProjectsDb> {
        let singleton = PROJECTS_DB.read().await;
        match singleton.clone() {
            Some(projects_db) => Ok(projects_db),
            None => Err(anyhow!("ProjectsDb is not initialized")),
        }
    }
}
