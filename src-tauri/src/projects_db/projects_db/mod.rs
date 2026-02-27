use migration::{Migrator, MigratorTrait};
use sea_orm::{Database, DatabaseConnection, DbErr};

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

impl ProjectsDb {
    pub async fn new(db_path: &str) -> Result<Self, DbErr> {
        let db = Database::connect(db_path).await?;
        Migrator::up(&db, None).await?;
        Ok(Self { db: db })
    }
}

mod images;
mod import;
mod models;
mod projects;
mod watchfolders;

mod mixed_error;
pub use mixed_error::MixedError;
