use migration::{Migrator, MigratorTrait};
use sea_orm::{
    ConnectionTrait, Database, DatabaseConnection, DbErr, SqlxSqliteConnector, Statement,
};

mod images;
mod import;
mod models;
mod projects;
mod watchfolders;

mod mixed_error;
pub use mixed_error::MixedError;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

use std::str::FromStr;

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

impl ProjectsDb {
    pub async fn new(db_path: &str, ext_path: &str) -> Result<Self, String> {
        let options = SqliteConnectOptions::from_str(db_path)
            .map_err(|e| e.to_string())?
            .extension(ext_path.to_string());

        let pool = SqlitePoolOptions::new()
            .connect_with(options)
            .await
            .map_err(|e| e.to_string())?;

        let db: DatabaseConnection = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool);

        Migrator::up(&db, None).await.map_err(|e| e.to_string())?;

        Ok(Self { db })
    }
}
