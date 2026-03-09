use std::sync::Arc;

use crate::dtp_service::jobs::CheckFolderJob;
use crate::dtp_service::{events::DTPEvent, jobs::maintenance::MaintenanceJob};

use super::job::{Job, JobContext, JobResult};

pub struct SyncJob {
    reset_locks: bool,
}

impl SyncJob {
    pub fn new(reset_locks: bool) -> Self {
        Self { reset_locks }
    }
}

#[async_trait::async_trait]
impl Job for SyncJob {
    fn get_label(&self) -> String {
        format!("SyncJob")
    }
    fn start_event(self: &Self) -> Option<DTPEvent> {
        Some(DTPEvent::SyncStarted)
    }
    async fn on_complete(self: &Self, ctx: &JobContext) {
        ctx.events.emit(DTPEvent::SyncComplete);
    }
    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let folders = ctx
            .pdb
            .list_watch_folders()
            .await
            .map_err(|e| e.to_string())?;

        let mut subtasks: Vec<Arc<dyn Job>> = Vec::new();

        for folder in folders {
            // if folder.maint != 0 {
            //     let mut maint_tasks = MaintenanceJob::from_int(folder.maint, folder.clone());
            //     subtasks.append(&mut maint_tasks);
            // }
            subtasks.push(Arc::new(CheckFolderJob::new(
                folder.clone(),
                self.reset_locks,
                true,
                None,
            )) as Arc<dyn Job>)
        }

        Ok(JobResult::Subtasks(subtasks))
    }
}
