use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use dtm_macros::{dtm_command, dtp_commands};
use tauri::{ipc::Channel, State};
use tokio::sync::{OnceCell, RwLock};

use crate::{
    dtp_service::{
        AppHandleWrapper, events::{self, DTPEvent}, jobs::{FetchModels, Job, JobContext, SyncJob}, scheduler::Scheduler, watch::WatchService
    },
    projects_db::{self, DtmProtocol, ProjectsDb, get_last_row},
};

#[derive(Clone)]
pub struct DTPService {
    pub app_handle: AppHandleWrapper,
    pub events: events::DTPEventsService,
    pdb: Arc<RwLock<Option<ProjectsDb>>>,
    pub scheduler: Arc<RwLock<Option<Scheduler>>>,
    pub watch: Arc<RwLock<Option<WatchService>>>,
    dtm_protocol: Arc<OnceCell<DtmProtocol>>,
    pub auto_watch: Arc<AtomicBool>,
}

#[dtp_commands]
impl DTPService {
    pub fn new(app_handle: AppHandleWrapper) -> Self {
        let pdb = Arc::new(RwLock::new(None));
        let events = events::DTPEventsService::new();
        let scheduler = Arc::new(RwLock::new(None));
        let watch = Arc::new(RwLock::new(None));
        let dtm_protocol = Arc::new(OnceCell::new());

        Self {
            app_handle,
            pdb: pdb,
            events,
            scheduler,
            watch,
            dtm_protocol,
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
        // #FOLDER
        self.events.set_channel(channel);

        let ctx = Arc::new(JobContext {
            app_handle: self.app_handle.clone(),
            pdb: pdb.clone(),
            events: self.events.clone(),
            dtp: self.clone(),
        });

        let scheduler = Scheduler::new(ctx.clone());
        {
            let mut guard = self.scheduler.write().await;
            *guard = Some(scheduler.clone());
        }

        let watch = WatchService::new(scheduler.clone());
        watch.watch_volumes().await.unwrap();
        {
            let mut guard = self.watch.write().await;
            *guard = Some(watch);
        }

        self.events.emit(DTPEvent::DtpServiceReady);

        self.add_job(FetchModels {});
        self.add_job(SyncJob::new(true));

        Ok(())
    }

    pub async fn get_db(&self) -> Result<ProjectsDb, String> {
        self.pdb
            .read()
            .await
            .clone()
            .ok_or_else(|| "DB not ready".to_string())
    }

    pub async fn dtm_protocol(&self) -> &DtmProtocol {
        self.dtm_protocol
            .get_or_init(|| async { DtmProtocol::new(self.get_db().await.unwrap()) })
            .await
    }

    #[dtp_command]
    pub async fn sync(&self) -> Result<(), String> {
        let scheduler = self.scheduler.read().await;
        let scheduler = scheduler.as_ref().unwrap();
        scheduler.add_job(SyncJob::new(false));

        Ok(())
    }

    // test to compare checking rowid vs file metadata
    pub async fn check_all(&self) -> Result<(), String> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await.unwrap();
        let mut last_rows: Vec<(i64, i64)> = Vec::new();
        for project in projects {
            let last_row = get_last_row(&project.full_path).await.unwrap();
            last_rows.push((project.id, last_row.0));
        }

        println!("Checked all projects: {:?}", last_rows);
        println!("Checked all projects: {}", start.elapsed().as_millis());
        Ok(())
    }
    pub async fn check_all_2(&self) -> Result<(), String> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await.unwrap();
        let mut data: Vec<(i64, i64)> = Vec::new();
        for project in projects {
            let base = fs::metadata(&project.full_path).map_or(0, |m| m.len() as i64);
            let wal =
                fs::metadata(format!("{}-wal", &project.full_path)).map_or(0, |m| m.len() as i64);
            data.push((base, wal));
        }

        println!("Checked all projects: {:?}", data);
        println!("Checked all projects: {}", start.elapsed().as_millis());
        Ok(())
    }

    pub async fn resume_watch(&self, path: &str, recursive: bool) {
        let watch = self.watch.read().await;
        let watch = watch.as_ref().unwrap();
        watch.watch_folder(path, recursive).await.unwrap();
    }

    pub async fn stop_watch(&self, path: &str) {
        let watch = self.watch.read().await;
        let watch = watch.as_ref().unwrap();
        watch.stop_watch_folder(path).await.unwrap();
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

    #[dtp_command]
    pub async fn lock_folder(&self, watchfolder_id: i64) -> Result<(), String> {
        let folder = self
            .get_db()
            .await
            .unwrap()
            .update_watch_folder(watchfolder_id, None, None, Some(true))
            .await?;
        self.stop_watch(&folder.path).await;
        projects_db::close_folder(&folder.path).await;
        self.events.emit(DTPEvent::WatchFoldersChanged);
        Ok(())
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
