use std::fs;
use std::path::PathBuf;

use semver::Version;
use tauri::{AppHandle, Manager};

/// Public entry point (your requested API)
pub async fn run_migrations(app: AppHandle) -> Result<(), String> {
    let current_version =
        Version::parse(&app.package_info().version.to_string()).map_err(|e| e.to_string())?;

    let path = version_file(&app)?;

    let last_version = read_last_version(&path).and_then(|v| Version::parse(&v).ok());

    // Run migrations in order
    for version in Versions::ordered() {
        if should_run(&last_version, &current_version, version.as_str()) {
            run_migration(app.clone(), version).await?;
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

fn version_file(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;

    fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    path.push("version.txt");
    Ok(path)
}

fn read_last_version(path: &PathBuf) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn write_version(path: &PathBuf, version: &str) -> Result<(), String> {
    fs::write(path, version).map_err(|e| e.to_string())
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
    V0_4_3,
}

impl Versions {
    fn as_str(&self) -> &'static str {
        match self {
            Versions::V0_4_3 => "0.4.3",
        }
    }

    /// Ordered list of migrations (IMPORTANT)
    fn ordered() -> Vec<Versions> {
        vec![Versions::V0_4_3]
    }
}

//
// ─────────────────────────────────────
// Migration runner
// ─────────────────────────────────────
//

async fn run_migration(app: AppHandle, version: Versions) -> Result<(), String> {
    match version {
        Versions::V0_4_3 => migrate_0_4_3(app).await,
    }
}

//
// ─────────────────────────────────────
// Actual migrations
// ─────────────────────────────────────
//

async fn migrate_0_4_3(app: AppHandle) -> Result<(), String> {
    println!("Running migration 0.4.3");

    let store_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tauri-plugin-valtio");
    let settings_file_dev = store_dir.join("dtp-settings.dev.json");
    let settings_file = store_dir.join("dtp-settings.json");

    if settings_file_dev.exists() {
        fs::remove_file(settings_file_dev).map_err(|e| e.to_string())?;
    }

    if settings_file.exists() {
        fs::remove_file(settings_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}
