#![allow(dead_code)]

use std::{
    env, fs,
    sync::{Arc, RwLock},
};

use dtm_lib::dtp_service::{
    events::DTPEvent,
    jobs::{Job, JobContext, JobResult},
    AppHandleWrapper, DTPService,
};
use serde_json::Value;
use tempfile::TempDir;

use crate::common::projects::{WatchFolderHelper, Watchfolder};

pub mod projects;

pub struct EventHelper {
    received: Arc<RwLock<Vec<String>>>,
}

impl EventHelper {
    pub fn new<E>() -> (Self, tauri::ipc::Channel<E>) {
        let received = Arc::new(RwLock::new(Vec::new()));
        let received_clone = received.clone();
        let channel = tauri::ipc::Channel::new(move |event| {
            match event {
                tauri::ipc::InvokeResponseBody::Json(json_string) => {
                    let v: Value = serde_json::from_str(&json_string).unwrap();
                    let event_type = v["type"].as_str().unwrap();
                    println!("Received event: {}", event_type);
                    received_clone.write().unwrap().push(event_type.to_string());
                }
                _ => {
                    println!("Received data event")
                }
            }
            Ok(())
        });
        (EventHelper { received }, channel)
    }

    pub fn count(self: &Self, event_type: &str) -> usize {
        self.received
            .read()
            .unwrap()
            .iter()
            .filter(|e| *e == event_type)
            .count()
    }

    pub async fn assert_count(self: &Self, event_type: &str, count: usize) {
        let mut max_checks = MAX_WAIT_MS / 100;
        while self.count(event_type) < count && max_checks > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            max_checks -= 1;
        }
        assert_eq!(
            self.count(event_type),
            count,
            "Expected {} events of type {}",
            count,
            event_type
        );
    }

    pub fn reset_counts(&self) {
        self.received.write().unwrap().clear();
    }
}

pub const MAX_WAIT_MS: u64 = 8000;
pub fn reset_db() {
    let db_path = env::current_dir()
        .unwrap()
        .join("test_data")
        .join("temp")
        .join("app_data_dir")
        .join("projects4-dev.db");

    if db_path.exists() {
        fs::remove_file(db_path).unwrap();
    }
}

#[derive(Clone)]
pub struct TestJob {
    pub id: u64,
    pub delay: u64,
    pub subtasks: Vec<TestJob>,
    pub msg: Option<String>,
    pub should_fail: bool,
}
impl TestJob {
    pub fn new(id: u64, delay: u64) -> Self {
        Self {
            id,
            delay,
            subtasks: Vec::new(),
            msg: None,
            should_fail: false,
        }
    }

    pub fn with_fail(mut self) -> Self {
        self.should_fail = true;
        self
    }

    pub fn with_msg(mut self, msg: String) -> Self {
        self.msg = Some(msg);
        self
    }

    pub fn with_subtasks(mut self, subtasks: Vec<TestJob>) -> Self {
        self.subtasks = subtasks;
        self
    }

    pub fn with_subtask(mut self, subtask: TestJob) -> Self {
        self.subtasks.push(subtask);
        self
    }
}
#[async_trait::async_trait]
impl Job for TestJob {
    fn get_label(&self) -> String {
        format!("TestJob {}", self.id)
    }

    fn start_event(&self) -> Option<DTPEvent> {
        Some(DTPEvent::TestEventStart(Some(self.id), None))
    }

    async fn on_complete(&self, ctx: &JobContext) {
        ctx.events
            .emit(DTPEvent::TestEventComplete(Some(self.id), None));
    }

    async fn on_failed(&self, ctx: &JobContext, error: String) {
        ctx.events
            .emit(DTPEvent::TestEventFailed(Some(self.id), None, Some(error)));
    }

    async fn execute(&self, _ctx: &JobContext) -> Result<JobResult, String> {
        println!("Executing TestJob {}", self.id);
        tokio::time::sleep(std::time::Duration::from_millis(self.delay)).await;
        if self.should_fail {
            return Err("TestJob failed".to_string());
        }
        if self.subtasks.is_empty() {
            Ok(JobResult::None)
        } else {
            let subtasks = self
                .subtasks
                .iter()
                .map(|j| {
                    let j: Arc<dyn Job> = Arc::new(j.clone());
                    j
                })
                .collect();
            Ok(JobResult::Subtasks(subtasks))
        }
    }
}

pub async fn test_fixture(
    auto_watch: bool,
    copy_db: bool,
) -> (DTPService, EventHelper, WatchFolderHelper, String) {
    let temp_dir = TempDir::new_in("test_data/temp").unwrap();
    let temp_dir_path = temp_dir.path().to_str().unwrap().to_string();
    let wfh = WatchFolderHelper::get(Watchfolder::A, temp_dir);
    // reset_db();
    let app_handle = AppHandleWrapper::new(None);
    let dtps = DTPService::new(app_handle);

    let app_data_dir = format!("{}/app_data_dir", temp_dir_path);
    let db_path = format!("{}/projects4.db", app_data_dir);
    fs::create_dir_all(&app_data_dir).unwrap();

    if copy_db {
        fs::copy("test_data/testdb.db", &db_path).unwrap();
    }

    let (event_helper, channel) = EventHelper::new();
    let _ = dtps
        .connect(
            channel,
            auto_watch,
            format!(
                "sqlite://{}/app_data_dir/projects4.db?mode=rwc",
                temp_dir_path,
            )
            .to_string(),
        )
        .await
        .unwrap();

    (dtps, event_helper, wfh, db_path)
}
