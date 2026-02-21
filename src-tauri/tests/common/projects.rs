use std::fs;

pub const PROJECTS_DIR: &str = "test_data/projects";
pub const WATCHFOLDER_A: &str = "test_data/temp/watchfolder_a";

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
        let original_path = self.get_original_path();
        let watchfolder_path = self.get_watchfolder_path();
        println!("Copying {} to {}", original_path, watchfolder_path);
        fs::copy(original_path, watchfolder_path).unwrap();
    }

    pub fn remove(&self) {
        let watchfolder_path = self.get_watchfolder_path();
        fs::remove_file(watchfolder_path).unwrap();
    }

    pub fn copy_variant(&self) {
        if let Some(variant) = &self.variant {
            let original_path = self.get_variant_path();
            let watchfolder_path = self.get_watchfolder_path();
            fs::copy(original_path, watchfolder_path).unwrap();
        }
    }

    pub fn remove_variant(&self) {
        self.copy();
    }

    pub fn get_original_path(&self) -> String {
        format!("{}/{}", PROJECTS_DIR, self.filename)
    }

    pub fn get_variant_path(&self) -> String {
        format!("{}/{}", PROJECTS_DIR, self.variant.as_ref().unwrap())
    }

    pub fn get_watchfolder_path(&self) -> String {
        format!("{}/{}", self.watchfolder, self.filename)
    }
}

pub struct WatchFolderHelper {
    pub projects: Vec<TestProject>,
    pub watchfolder_path: String,
    pub bookmark: String,
}

impl WatchFolderHelper {
    pub fn get(watchfolder: Watchfolder) -> Self {
        let watchfolder_path = std::env::current_dir()
            .unwrap()
            .join(get_watchfolder_path(watchfolder))
            .to_str()
            .unwrap()
            .to_string();
        println!(
            "Current dir: {}",
            std::env::current_dir().unwrap().display()
        );
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

    pub fn remove_variants(&self) {
        for project in &self.projects {
            project.remove_variant();
        }
    }
}
