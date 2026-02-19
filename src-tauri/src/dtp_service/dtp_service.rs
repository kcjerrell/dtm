use std::sync::Arc;

use dtm_macros::{dtm_command, dtp_commands};
use tauri::{ipc::Channel, AppHandle, State};
use tokio::sync::RwLock;

use crate::{
    dtp_service::{
        events::{self, DTPEvent},
        jobs::{JobContext, SyncJob},
        scheduler::Scheduler,
        watch::WatchService,
    },
    projects_db::ProjectsDb,
};

#[derive(Clone)]
pub struct DTPService {
    pub app_handle: AppHandle,
    pub events: events::DTPEventsService,
    pdb: Arc<RwLock<Option<ProjectsDb>>>,
    pub scheduler: Arc<RwLock<Option<Scheduler>>>,
    watch: Arc<RwLock<Option<WatchService>>>,
}

#[dtp_commands]
impl DTPService {
    pub fn new(app_handle: AppHandle) -> Self {
        let pdb = Arc::new(RwLock::new(None));
        let events = events::DTPEventsService::new();
        let scheduler = Arc::new(RwLock::new(None));
        let watch = Arc::new(RwLock::new(None));

        Self {
            app_handle,
            pdb: pdb,
            events,
            scheduler,
            watch,
        }
    }

    pub async fn connect(&self, channel: Channel<DTPEvent>) -> Result<(), String> {
        let pdb = ProjectsDb::get_or_init(&self.app_handle).await?;
        {
            let mut guard = self.pdb.write().await;
            *guard = Some(pdb.clone());
        }

        self.events.set_channel(channel);

        let ctx = JobContext {
            app_handle: self.app_handle.clone(),
            pdb: pdb.clone(),
            events: self.events.clone(),
        };

        let scheduler = Scheduler::new(&ctx);
        {
            let mut guard = self.scheduler.write().await;
            *guard = Some(scheduler.clone());
        }

        let watch = WatchService::new(scheduler.clone());
        {
            let mut guard = self.watch.write().await;
            *guard = Some(watch);
        }

        self.events.emit(DTPEvent::DtpServiceReady);

        self.watch_all().await;

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
        scheduler.add_job(SyncJob);

        Ok(())
    }

    async fn watch_all(&self) {
        let watchfolders = self
            .list_watch_folders()
            .await
            .unwrap()
            .into_iter()
            .map(|wf| (wf.path, wf.recursive.unwrap_or(false)))
            .collect::<Vec<(String, bool)>>();

        let watch = self.watch.read().await;
        let watch = watch.as_ref().unwrap();
        watch.watch_folders(watchfolders).await.unwrap();
    }
}

#[dtm_command]
pub async fn dtp_test(state: State<'_, DTPService>) -> Result<String, String> {
    let scheduler = state.scheduler.read().await;
    let scheduler = scheduler.as_ref().unwrap();
    scheduler.add_job(SyncJob);
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
