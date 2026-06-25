use migration::{Migrator, MigratorTrait};
use sea_orm::{DatabaseConnection, SqlxSqliteConnector};

mod images;
mod import;
mod models;
mod projects;
mod watchfolders;

mod mixed_error;
pub use mixed_error::MixedError;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

use libsqlite3_sys::{sqlite3_auto_extension, SQLITE_OK};
use std::str::FromStr;
use std::sync::OnceLock;

static REGISTER_SQLITE_VEC: OnceLock<Result<(), String>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

impl ProjectsDb {
    pub async fn new(db_path: &str) -> Result<Self, String> {
        register_sqlite_vec()?;

        let options = SqliteConnectOptions::from_str(db_path).map_err(|e| e.to_string())?;

        let pool = SqlitePoolOptions::new()
            .connect_with(options)
            .await
            .map_err(|e| e.to_string())?;

        let db: DatabaseConnection = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool);

        Migrator::up(&db, None).await.map_err(|e| e.to_string())?;

        Ok(Self { db })
    }
}

fn register_sqlite_vec() -> Result<(), String> {
    REGISTER_SQLITE_VEC
        .get_or_init(|| {
            let result = unsafe {
                sqlite3_auto_extension(Some(std::mem::transmute(
                    sqlite_vec::sqlite3_vec_init as *const (),
                )))
            };

            if result == SQLITE_OK {
                Ok(())
            } else {
                Err(format!("failed to register sqlite-vec extension: {result}"))
            }
        })
        .clone()
}
