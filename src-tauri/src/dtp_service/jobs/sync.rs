use std::sync::Arc;

use crate::dtp_service::events::DTPEvent;

use super::job::{Job, JobContext, JobResult};
use super::sync_folder::SyncFolderJob;

pub struct SyncJob;

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

        let subtasks = folders
            .iter()
            .map(|wf| Arc::new(SyncFolderJob::new(wf)) as Arc<dyn Job>)
            .collect();

        Ok(JobResult::Subtasks(subtasks))
    }
}
