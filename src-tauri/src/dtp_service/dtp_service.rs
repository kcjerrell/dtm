use std::sync::Arc;

use dtm_macros::{dtm_command, dtp_commands};
use tauri::{ipc::Channel, AppHandle, State};
use tokio::sync::RwLock;

use crate::{
    dtp_service::{
        actor::{create_actor, DTPActor},
        events::{self, DTPEvent},
    },
    projects_db::{dtos::project::ProjectExtra, ProjectsDb},
};

#[derive(Clone)]
pub struct DTPService {
    app_handle: AppHandle,
    pdb: Arc<RwLock<Option<ProjectsDb>>>,
    sender: DTPActor,
    events: events::DTPEventsService,
}

impl DTPService {
    pub fn new(app_handle: AppHandle) -> Self {
        let pdb = Arc::new(RwLock::new(None));
        let events = events::DTPEventsService::new();

        let sender = create_actor(&app_handle, &pdb, &events);

        Self {
            app_handle,
            pdb: pdb,
            sender: sender,
            events,
        }
    }

    pub async fn connect(&self, channel: Channel<DTPEvent>) -> Result<(), String> {
        let pdb = ProjectsDb::get_or_init(&self.app_handle).await?;
        self.events.set_channel(channel);
        let mut guard = self.pdb.write().await;
        *guard = Some(pdb.clone());

        self.events.emit(DTPEvent::DTPServiceReady);

        Ok(())
    }

    pub async fn get_db(&self) -> Result<ProjectsDb, String> {
        self.pdb
            .read()
            .await
            .clone()
            .ok_or_else(|| "DB not ready".to_string())
    }
}

#[dtm_command]
pub async fn dtp_connect(
    state: State<'_, DTPService>,
    channel: Channel<DTPEvent>,
) -> Result<(), String> {
    let _ = state.connect(channel).await;
    Ok(())
}
