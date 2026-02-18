use std::sync::Arc;

use tauri::AppHandle;

use crate::{
    dtp_service::events::{DTPEvent, DTPEventsService},
    projects_db::ProjectsDb,
};

#[async_trait::async_trait]
pub trait Job: Send + Sync {
    fn get_label(&self) -> String;
    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String>;
    fn start_event(self: &Self) -> Option<DTPEvent> {
        None
    }
    async fn on_complete(&self, _ctx: &JobContext) {}
    async fn on_failed(&self, _ctx: &JobContext, _error: String) {}
}

#[derive(Default)]
pub enum JobResult {
    #[default]
    None,
    Event(DTPEvent),
    Subtasks(Vec<Arc<dyn Job>>),
}

#[derive(Clone)]
pub struct JobContext {
    pub app_handle: AppHandle,
    pub pdb: ProjectsDb,
    pub events: DTPEventsService,
}
