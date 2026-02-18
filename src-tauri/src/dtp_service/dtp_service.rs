use std::sync::Arc;

use dtm_macros::{dtm_command, dtp_commands};
use tauri::{ipc::Channel, AppHandle, State};
use tokio::sync::RwLock;

use crate::{
    dtp_service::{
        events::{self, DTPEvent},
        jobs::{JobContext, SyncJob},
        scheduler::Scheduler,
    },
    projects_db::ProjectsDb,
};

#[derive(Clone)]
pub struct DTPService {
    pub app_handle: AppHandle,
    pdb: Arc<RwLock<Option<ProjectsDb>>>,
    pub events: events::DTPEventsService,
    pub scheduler: Arc<RwLock<Option<Scheduler>>>,
}

#[dtp_commands]
impl DTPService {
    pub fn new(app_handle: AppHandle) -> Self {
        let pdb = Arc::new(RwLock::new(None));
        let events = events::DTPEventsService::new();
        let scheduler = Arc::new(RwLock::new(None));

        Self {
            app_handle,
            pdb: pdb,
            events,
            scheduler,
        }
    }

    pub async fn connect(&self, channel: Channel<DTPEvent>) -> Result<(), String> {
        let pdb = ProjectsDb::get_or_init(&self.app_handle).await?;
        let mut guard = self.pdb.write().await;
        *guard = Some(pdb.clone());

        self.events.set_channel(channel);

        let ctx = JobContext {
            app_handle: self.app_handle.clone(),
            pdb: pdb.clone(),
            events: self.events.clone(),
        };

        let scheduler = Scheduler::new(&ctx);
        let mut guard = self.scheduler.write().await;
        *guard = Some(scheduler.clone());

        self.events.emit(DTPEvent::DtpServiceReady);

        Ok(())
    }

    pub async fn get_db(&self) -> Result<ProjectsDb, String> {
        self.pdb
            .read()
            .await
            .clone()
            .ok_or_else(|| "DB not ready".to_string())
    }

    #[dtp_command]
    pub async fn sync(&self) -> Result<(), String> {
        let scheduler = self.scheduler.read().await;
        let scheduler = scheduler.as_ref().unwrap();
        scheduler.add_job(SyncJob).await;

        Ok(())
    }
}

#[dtm_command]
pub async fn dtp_test(state: State<'_, DTPService>) -> Result<String, String> {
    let scheduler = state.scheduler.read().await;
    let scheduler = scheduler.as_ref().unwrap();
    scheduler.add_job(SyncJob).await;
    Ok("ok".to_string())
}

#[dtm_command]
pub async fn dtp_connect(
    state: State<'_, DTPService>,
    channel: Channel<DTPEvent>,
) -> Result<(), String> {
    let _ = state.connect(channel).await;
    Ok(())
}
