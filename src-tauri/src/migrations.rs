use std::fs;
use std::path::PathBuf;

use entity::watch_folders::{Column, Entity as WatchFolders};
use migration::{Migrator, MigratorTrait};
use sea_orm::{Database, EntityTrait, ExprTrait};
use sea_query::Expr;
use semver::Version;
use tauri::{AppHandle, Manager};

use crate::dtp_service::{get_db_url, jobs::MaintenanceTaskKind, AppHandleWrapper};
use anyhow::{Context, Result};

/// Public entry point (your requested API)
pub async fn run_migrations(app: AppHandle) -> Result<()> {
    let wrapper = AppHandleWrapper::new(Some(app.clone()));
    let db_url = get_db_url(&wrapper);
    let db = Database::connect(&db_url)
        .await
        .with_context(|| format!("Failed to connect to application database at '{db_url}'"))?;

    // Version migrations may read or update the application database. Apply the
    // schema migrations first, including on a fresh install where no tables exist.
    Migrator::up(&db, None)
        .await
        .with_context(|| format!("Failed to run database migrations on '{db_url}'"))?;

    let current_version = Version::parse(&app.package_info().version.to_string())
        .context("Failed to parse current version")?;

    let path = version_file(&app)?;

    let last_version = read_last_version(&path).and_then(|v| Version::parse(&v).ok());

    // Run migrations in order
    for version in Versions::ordered() {
        if should_run(&last_version, &current_version, version.as_str()) {
            run_migration(app.clone(), &db, version).await?;
        }
    }

    // Only write version if everything succeeded
    write_version(&path, &current_version.to_string())?;

    Ok(())
}

//
// ─────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────
//

fn version_file(app: &AppHandle) -> Result<PathBuf> {
    let mut path = app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?;

    fs::create_dir_all(&path).context("Failed to create app data dir")?;

    let filename = if cfg!(debug_assertions) {
        "dev_version.txt"
    } else {
        "version.txt"
    };
    path.push(filename);
    Ok(path)
}

fn read_last_version(path: &PathBuf) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn write_version(path: &PathBuf, version: &str) -> Result<()> {
    fs::write(path, version).context("Failed to write version file")
}

//
// ─────────────────────────────────────
// Version + migration logic
// ─────────────────────────────────────
//

fn should_run(last: &Option<Version>, current: &Version, target: &str) -> bool {
    let target = match Version::parse(target) {
        Ok(v) => v,
        Err(_) => return false,
    };

    match last {
        None => true, // first install → run all (change if desired)
        Some(prev) => prev < &target && current >= &target,
    }
}

//
// ─────────────────────────────────────
// Migration definitions
// ─────────────────────────────────────
//

#[derive(Debug, Clone, Copy)]
enum Versions {
    V0_5_0,
}

impl Versions {
    fn as_str(&self) -> &'static str {
        match self {
            Versions::V0_5_0 => "0.5.0",
        }
    }

    /// Ordered list of migrations (IMPORTANT)
    fn ordered() -> Vec<Versions> {
        vec![Versions::V0_5_0]
    }
}

//
// ─────────────────────────────────────
// Migration runner
// ─────────────────────────────────────
//

async fn run_migration(
    app: AppHandle,
    db: &sea_orm::DatabaseConnection,
    version: Versions,
) -> Result<()> {
    match version {
        Versions::V0_5_0 => migrate_0_5_0(app, db).await,
    }
}

//
// ─────────────────────────────────────
// Actual migrations
// ─────────────────────────────────────
//

async fn migrate_0_5_0(app: AppHandle, db: &sea_orm::DatabaseConnection) -> Result<()> {
    log::info!("Running migration 0.5.0");

    let store_dir = app
        .path()
        .app_data_dir()
        .context("Failed to get app data dir")?
        .join("tauri-plugin-valtio");
    let settings_file_debug = store_dir.join("dev_dtp-settings.dev.json");
    let settings_file_dev = store_dir.join("dtp-settings.dev.json");
    let settings_file = store_dir.join("dtp-settings.json");

    if settings_file_debug.exists() {
        fs::remove_file(settings_file_debug).context("Failed to remove dev settings file")?;
    }

    if settings_file_dev.exists() {
        fs::remove_file(settings_file_dev).context("Failed to remove dev settings file")?;
    }

    if settings_file.exists() {
        fs::remove_file(settings_file).context("Failed to remove settings file")?;
    }

    add_db_maintenance(db, MaintenanceTaskKind::RescanClipCount).await?;

    Ok(())
}

async fn add_db_maintenance(
    db: &sea_orm::DatabaseConnection,
    task: MaintenanceTaskKind,
) -> Result<()> {
    let maint_value: u32 = task as u32;

    WatchFolders::update_many()
        .col_expr(Column::Maint, Expr::col(Column::Maint).bit_or(maint_value))
        .exec(db)
        .await
        .context("Failed to update watch folders for maintenance")?;

    Ok(())
}
