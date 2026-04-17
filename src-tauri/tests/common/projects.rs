use std::{fs, path::PathBuf};

use tempfile::TempDir;
use tracing::warn;

pub const PROJECTS_DIR: &str = "test_data/projects";
pub const WATCHFOLDER_A: &str = "watchfolder_a";

pub enum Watchfolder {
    A,
}

fn get_watchfolder_path(watchfolder: Watchfolder) -> String {
    match watchfolder {
        Watchfolder::A => WATCHFOLDER_A.to_string(),
    }
}

pub struct TestProject {
    pub filename: String,
    pub variant: Option<String>,
    pub watchfolder: String,
}

impl TestProject {
    pub fn copy(&self) {
        let src_path = self.get_src_path();
        let dest_path = self.get_dest_path();
        println!("Copying {} to {}", src_path, dest_path);
        fs::copy(src_path, dest_path).unwrap();
    }

    pub fn remove(&self) {
        let remove_path = self.get_dest_path();
        let remove_path = PathBuf::from(remove_path);

        if remove_path.exists() {
            fs::remove_file(&remove_path).unwrap();
        }

        if remove_path.with_extension("sqlite3-wal").exists() {
            fs::remove_file(&remove_path.with_extension("sqlite3-wal")).unwrap();
        }

        if remove_path.with_extension("sqlite3-shm").exists() {
            fs::remove_file(&remove_path.with_extension("sqlite3-shm")).unwrap();
        }
    }

    pub fn copy_variant(&self) {
        if self.variant.is_some() {
            let src_path = self.get_variant_src_path();
            let dest_path = self.get_dest_path();
            fs::copy(src_path, dest_path).unwrap();
        } else {
            warn!("No variant for {}", self.filename);
        }
    }

    pub fn get_src_path(&self) -> String {
        format!("{}/{}", PROJECTS_DIR, self.filename)
    }

    pub fn get_variant_src_path(&self) -> String {
        format!("{}/{}", PROJECTS_DIR, self.variant.as_ref().unwrap())
    }

    pub fn get_dest_path(&self) -> String {
        format!("{}/{}", self.watchfolder, self.filename)
    }
}

pub struct WatchFolderHelper {
    pub projects: Vec<TestProject>,
    pub watchfolder_path: String,
    pub bookmark: String,
    pub temp_dir: TempDir,
}

impl WatchFolderHelper {
    pub fn get(watchfolder: Watchfolder, temp_dir: TempDir) -> Self {
        let watchfolder_path = temp_dir
            .path()
            .join(get_watchfolder_path(watchfolder))
            .to_str()
            .unwrap()
            .to_string();

        println!("Watchfolder path: {}", watchfolder_path);
        let bookmark: String = format!("TESTBOOKMARK::{}", watchfolder_path);

        let projects = vec![
            TestProject {
                filename: "test-project-a2.sqlite3".to_string(),
                variant: None,
                watchfolder: watchfolder_path.clone(),
            },
            TestProject {
                filename: "test-project-c-9.sqlite3".to_string(),
                variant: Some("test-project-c-10.sqlite3".to_string()),
                watchfolder: watchfolder_path.clone(),
            },
        ];
        let wh = Self {
            projects,
            watchfolder_path,
            bookmark,
            temp_dir,
        };
        wh.clear_all();
        wh
    }

    pub fn get_count(&self) -> usize {
        self.projects.len()
    }

    pub fn copy_all(&self) {
        for project in &self.projects {
            project.copy();
        }
    }

    pub fn clear_all(&self) {
        let _ = fs::remove_dir_all(&self.watchfolder_path);
        let _ = fs::create_dir_all(&self.watchfolder_path);
    }

    pub fn remove_all(&self) {
        for project in &self.projects {
            project.remove();
        }
    }

    pub fn copy_variants(&self) {
        for project in &self.projects {
            project.copy_variant();
        }
    }
}
