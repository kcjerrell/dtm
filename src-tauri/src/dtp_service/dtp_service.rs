use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use anyhow::Context;
use dtm_macros::{dtm_command, dtp_commands};
use tauri::{ipc::Channel, State};
use tokio::sync::{OnceCell, RwLock};

use crate::{
    dtp_service::{
        events::{self, DTPEvent},
        jobs::{FetchModels, Job, JobContext, ProjectSync, SyncJob, UpdateProjectJob},
        scheduler::Scheduler,
        watch::WatchService,
        AppHandleWrapper,
    },
    projects_db::{self, get_last_row, DtmProtocol, ProjectsDb},
    IntoTAResult, TAResult,
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
    ) -> anyhow::Result<()> {
        self.auto_watch.store(auto_watch, Ordering::Relaxed);
        let pdb = ProjectsDb::new(&db_path).await.context("Failed to create ProjectsDb")?;
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
        watch.watch_volumes().await.context("Failed to watch volumes")?;
        {
            let mut guard = self.watch.write().await;
            *guard = Some(watch);
        }

        self.events.emit(DTPEvent::DtpServiceReady);

        self.add_job(FetchModels {});
        self.add_job(SyncJob::new(true));

        Ok(())
    }

    pub async fn get_db(&self) -> anyhow::Result<ProjectsDb> {
        self.pdb
            .read()
            .await
            .clone()
            .context("DB not ready")
    }

    pub async fn dtm_protocol(&self) -> &DtmProtocol {
        self.dtm_protocol
            .get_or_init(|| async { DtmProtocol::new(self.get_db().await.unwrap()) })
            .await
    }

    #[dtp_command]
    pub async fn sync(&self) -> TAResult<()> {
        let scheduler = self.scheduler.read().await;
        let scheduler = scheduler.as_ref().ok_or_else(|| anyhow::anyhow!("Scheduler not ready")).into_ta_result()?;
        scheduler.add_job(SyncJob::new(false));

        Ok(())
    }

    #[dtp_command]
    pub async fn sync_projects(
        &self,
        project_ids: Vec<i64>,
        check_deletions: bool,
    ) -> TAResult<()> {
        for project_id in project_ids {
            let sync = ProjectSync::from_id(&self.get_db().await.map_err(anyhow::Error::msg).into_ta_result()?, project_id)
                .await
                .map_err(anyhow::Error::msg).into_ta_result()?;
            self.add_job(UpdateProjectJob::new(&sync, false, check_deletions).map_err(anyhow::Error::msg).into_ta_result()?);
        }
        Ok(())
    }

    /// Syncs the given projects, inserting each update at the front of the scheduler
    /// queue and waiting for it to finish before returning. Unlike `sync_projects`
    /// (fire-and-forget), this resolves only once every project is up to date, so
    /// callers can rely on the latest project state immediately afterwards.
    #[dtp_command]
    pub async fn sync_projects_and_wait(
        &self,
        project_ids: Vec<i64>,
        check_deletions: bool,
    ) -> TAResult<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg).into_ta_result()?;
        let scheduler = self
            .scheduler
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Scheduler not ready")).into_ta_result()?;
        for project_id in project_ids {
            let sync = ProjectSync::from_id(&db, project_id).await.map_err(anyhow::Error::msg).into_ta_result()?;
            let job = UpdateProjectJob::new(&sync, false, check_deletions).map_err(anyhow::Error::msg).into_ta_result()?;
            scheduler.add_job_front_and_wait(job).await.map_err(anyhow::Error::msg).into_ta_result()?;
        }
        Ok(())
    }

    // test to compare checking rowid vs file metadata
    pub async fn check_all(&self) -> anyhow::Result<()> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await.map_err(anyhow::Error::msg)?;
        let mut last_rows: Vec<(i64, i64)> = Vec::new();
        for project in projects {
            let last_row = get_last_row(&project.full_path).await.map_err(anyhow::Error::msg)?;
            last_rows.push((project.id, last_row.0));
        }

        println!("Checked all projects: {:?}", last_rows);
        println!("Checked all projects: {}", start.elapsed().as_millis());
        Ok(())
    }
    pub async fn check_all_2(&self) -> anyhow::Result<()> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await.map_err(anyhow::Error::msg)?;
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

    pub async fn resume_watch(&self, path: &str, recursive: bool) -> anyhow::Result<()> {
        let watch = self.watch.read().await;
        let watch = watch.as_ref().context("Watch not ready")?;
        watch.watch_folder(path, recursive).await.map_err(anyhow::Error::msg)
    }

    pub async fn stop_watch(&self, path: &str) -> anyhow::Result<()> {
        let watch = self.watch.read().await;
        let watch = watch.as_ref().context("Watch not ready")?;
        watch.stop_watch_folder(path).await.map_err(anyhow::Error::msg)
    }

    pub fn add_job<T: Job + 'static>(&self, job: T) {
        let dtp = self.clone();
        tokio::spawn(async move {
            let scheduler = dtp.scheduler.read().await;
            let scheduler = scheduler.as_ref().unwrap();
            scheduler.add_job(job);
        });
    }

    pub async fn stop(&self) -> anyhow::Result<()> {
        {
            let watch = self.watch.read().await;
            let watch = watch.as_ref().context("Watch not ready")?;
            watch.stop_all().await.map_err(anyhow::Error::msg)?;
        }
        {
            let mut guard = self.pdb.write().await;
            *guard = None;
        }

        {
            let scheduler = self.scheduler.read().await.clone();
            scheduler.context("Scheduler not ready")?.stop().await;
        }
        {
            let mut guard = self.scheduler.write().await;
            *guard = None;
        }
        {
            let mut guard = self.watch.write().await;
            *guard = None;
        }
        Ok(())
    }

    #[dtp_command]
    pub async fn lock_folder(&self, watchfolder_id: i64) -> TAResult<()> {
        let folder = self
            .get_db()
            .await.map_err(anyhow::Error::msg).into_ta_result()?
            .update_watch_folder(watchfolder_id, None, None, Some(true))
            .await.map_err(anyhow::Error::msg).into_ta_result()?;
        self.stop_watch(&folder.path).await.map_err(anyhow::Error::msg).into_ta_result()?;
        projects_db::close_folder(&folder.path).await;
        self.events.emit(DTPEvent::WatchFoldersChanged);
        Ok(())
    }

    #[dtp_command]
    pub async fn reset_db(&self) -> TAResult<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg).into_ta_result()?;
        let folders = db.list_watch_folders().await.map_err(anyhow::Error::msg).into_ta_result()?;
        let ids = folders.iter().map(|f| f.id).collect::<Vec<i64>>();
        db.remove_watch_folders(ids).await.map_err(anyhow::Error::msg).into_ta_result()?;
        Ok(())
    }
}

#[dtm_command]
pub async fn dtp_test(state: State<'_, AppHandleWrapper>) -> TAResult<()> {
    println!(
        "dtp test bla bla {}",
        state.get_home_dir().context("Failed to get home dir").into_ta_result()?.to_string_lossy()
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
) -> TAResult<()> {
    let db_path = get_db_url(&app_handle);
    check_old_path(&app_handle);
    let _ = state.connect(channel, auto_watch, db_path).await.into_ta_result();
    Ok(())
}

#[cfg(dev)]
const PROJECT_FILE_NAME: &str = "projects4-dev.db";
#[cfg(not(dev))]
const PROJECT_FILE_NAME: &str = "projects4.db";

pub fn get_db_url(app_handle: &AppHandleWrapper) -> String {
    let app_data_dir = app_handle.get_app_data_dir().unwrap();
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
    }
    let project_db_path = app_data_dir.join(PROJECT_FILE_NAME);
    format!("sqlite://{}?mode=rwc", project_db_path.to_str().unwrap())
}

pub fn get_db_file_path(app_handle: &AppHandleWrapper) -> String {
    let app_data_dir = app_handle.get_app_data_dir().unwrap();
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
    }
    let project_db_path = app_data_dir.join(PROJECT_FILE_NAME);
    project_db_path.to_str().unwrap().to_string()
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
