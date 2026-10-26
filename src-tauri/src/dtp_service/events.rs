use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;

use crate::projects_db::dtos::project::ProjectExtra;

#[derive(Clone, Default)]
pub struct DTPEventsService {
    sender: Arc<Mutex<Option<Channel<DTPEvent>>>>,
}

impl DTPEventsService {
    pub fn new() -> Self {
        Self {
            sender: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_channel(&self, sender: Channel<DTPEvent>) {
        let mut guard = self.sender.lock().unwrap();
        *guard = Some(sender);
    }

    pub fn emit(&self, event: DTPEvent) {
        if let Some(tx) = &*self.sender.lock().unwrap() {
            let _ = tx.send(event);
        }
    }
}

#[derive(serde::Serialize, Debug)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum DTPEvent {
    WatchFoldersChanged,

    ProjectAdded(ProjectExtra),
    ProjectRemoved(i64),
    ProjectUpdated(ProjectExtra),
    // when many projects are changed, such as on delete cascade
    ProjectsChanged,

    ModelsChanged,

    ImportStarted,
    ImportProgress(ScanProgress),
    ImportCompleted,

    SyncStarted,
    SyncComplete,
    /// Terminal failure, separate from progress completion.
    SyncFailed(String),

    FolderSyncStarted(i64),
    FolderSyncComplete(i64),

    ProjectSyncStarted(i64),
    ProjectSyncComplete(i64),

    DtpServiceReady,

    /// By default, tuple is (job id, msg)
    TestEventStart(Option<u64>, Option<String>),
    /// By default, tuple is (job id, msg)
    TestEventComplete(Option<u64>, Option<String>),
    /// By default, tuple is (job id, msg, error)
    TestEventFailed(Option<u64>, Option<String>, Option<String>),
}

#[derive(serde::Serialize, Debug)]
pub struct ScanProgress {
    pub projects_found: u64,
    pub projects_scanned: u64,
    pub images_found: u64,
    pub images_scanned: u64,
}
