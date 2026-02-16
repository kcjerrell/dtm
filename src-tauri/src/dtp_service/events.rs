use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;

use crate::projects_db::dtos::{project::ProjectExtra, watch_folder::WatchFolderDTO};

#[derive(Clone)]
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
        let sender = self.sender.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(tx) = &*sender.lock().unwrap() {
                let _ = tx.send(event);
            }
        });
    }
}

#[derive(serde::Serialize, Debug)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum DTPEvent {
    WatchFoldersChanged(Vec<WatchFolderDTO>),

    ProjectAdded(ProjectExtra),
    ProjectRemoved(i64),
    ProjectUpdated(ProjectExtra),

    ImportStarted,
    ImportProgress(ScanProgress),
    ImportCompleted,

    SyncStated,
    SyncComplete,

    DoItDone,
    DidTheThing,
    Won,

    DTPServiceReady,
}

#[derive(serde::Serialize, Debug)]
pub struct ScanProgress {
    pub projects_found: u64,
    pub projects_scanned: u64,
    pub images_found: u64,
    pub images_scanned: u64,
}
