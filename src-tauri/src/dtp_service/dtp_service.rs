use std::{fs, sync::{
    Arc, atomic::{AtomicBool, Ordering}
}};

use dtm_macros::{dtm_command, dtp_commands};
use tauri::{Manager, State, ipc::Channel};
use tokio::sync::RwLock;

use crate::{
    dtp_service::{
        AppHandleWrapper, events::{self, DTPEvent}, jobs::{Job, JobContext, SyncJob}, scheduler::Scheduler, watch::WatchService
    },
    projects_db::{DtmProtocol, ProjectsDb},
};

#[derive(Clone)]
pub struct DTPService {
    pub app_handle: AppHandleWrapper,
    pub events: events::DTPEventsService,
    pdb: Arc<RwLock<Option<ProjectsDb>>>,
    pub scheduler: Arc<RwLock<Option<Scheduler>>>,
    pub watch: Arc<RwLock<Option<WatchService>>>,
    pub auto_watch: Arc<AtomicBool>,
}

#[dtp_commands]
impl DTPService {
    pub fn new(app_handle: AppHandleWrapper) -> Self {
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
            auto_watch: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn connect(
        &self,
        channel: Channel<DTPEvent>,
        auto_watch: bool,
        db_path: String,
    ) -> Result<(), String> {
        self.auto_watch.store(auto_watch, Ordering::Relaxed);
        let pdb = ProjectsDb::new(&db_path).await.unwrap();
        {
            let mut guard = self.pdb.write().await;
            *guard = Some(pdb.clone());
        }

        self.events.set_channel(channel);

        let app_handle = self.app_handle.clone().app_handle.unwrap();
        let dtm_protocol = app_handle.state::<DtmProtocol>();
        dtm_protocol.init(pdb.clone()).await;

        let ctx = JobContext {
            app_handle: self.app_handle.clone(),
            pdb: pdb.clone(),
            events: self.events.clone(),
            dtp: self.clone(),
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

        // if self.auto_watch.load(Ordering::Relaxed) {
        //     self.watch_all().await;
        // }

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

    pub async fn watch_all(&self) {
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

    pub async fn resume_watch(&self, path: &str, recursive: bool) {
        if !self.auto_watch.load(Ordering::Relaxed) {
            return;
        }

        let watch = self.watch.read().await;
        let watch = watch.as_ref().unwrap();
        watch.watch(path, recursive).await.unwrap();
    }

    pub async fn stop_watch(&self, path: &str) {
        let watch = self.watch.read().await;
        let watch = watch.as_ref().unwrap();
        watch.unwatch(path).await.unwrap();
    }

    pub fn add_job<T: Job + 'static>(&self, job: T) {
        let dtp = self.clone();
        tokio::spawn(async move {
            let scheduler = dtp.scheduler.read().await;
            let scheduler = scheduler.as_ref().unwrap();
            scheduler.add_job(job);
        });
    }

    pub async fn stop(&self) {
        {
            let watch = self.watch.read().await;
            let watch = watch.as_ref().unwrap();
            watch.stop_all().await.unwrap();
        }
        {
            let mut guard = self.pdb.write().await;
            *guard = None;
        }

        {
            let scheduler = self.scheduler.read().await.clone();
            scheduler.unwrap().stop().await;
        }
        {
            let mut guard = self.scheduler.write().await;
            *guard = None;
        }
        {
            let mut guard = self.watch.write().await;
            *guard = None;
        }
    }
}

#[dtm_command]
pub async fn dtp_test(state: State<'_, AppHandleWrapper>) -> Result<(), String> {
    println!(
        "dtp test bla bla {}",
        state.get_home_dir().unwrap().to_string_lossy()
    );
    Ok(())
}
// let scheduler = state.scheduler.read().await;
// let scheduler = scheduler.as_ref().unwrap();
// scheduler.add_job(SyncJob);
// Ok("ok".to_string())

#[dtm_command]
pub async fn dtp_connect(
    app_handle: State<'_, AppHandleWrapper>,
    state: State<'_, DTPService>,
    channel: Channel<DTPEvent>,
    auto_watch: bool,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle);
    check_old_path(&app_handle);
    let _ = state.connect(channel, auto_watch, db_path).await;
    Ok(())
}

fn get_db_path(app_handle: &AppHandleWrapper) -> String {
    let app_data_dir = app_handle.get_app_data_dir().unwrap();
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
    }
    let project_db_path = app_data_dir.join("projects4.db");
    format!("sqlite://{}?mode=rwc", project_db_path.to_str().unwrap())
}

fn check_old_path(app_handle: &AppHandleWrapper) {
    let app_data_dir = app_handle.get_app_data_dir().unwrap();
    let old_path = app_data_dir.join("projects2.db");
    if old_path.exists() {
        fs::remove_file(old_path).unwrap_or_default();
    }
    let old_path = app_data_dir.join("projects3.db");
    if old_path.exists() {
        fs::remove_file(old_path).unwrap_or_default();
    }
}