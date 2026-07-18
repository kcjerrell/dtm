use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use dtm_macros::{dtm_command, dtp_commands};
use entity::enums::EmbeddingType;
use sea_orm::ConnectionTrait;
use sqlx::{sqlite::SqliteRow, Column, Row};
use tauri::{ipc::Channel, State};
use tokio::{
    sync::{OnceCell, RwLock},
    time::Instant,
};

use crate::{
    IntoTAResult, ResourceHandle, Tensor as DtmTensor, dtp_service::{
        AppHandleWrapper, EmbeddingService, events::{self, DTPEvent}, jobs::{FetchModels, Job, JobContext, ProjectSync, SyncJob, UpdateProjectJob}, scheduler::Scheduler, watch::WatchService,
    }, projects_db::{
        self, DtProjectRef, DtResourceHandle, DtmProtocol, ProjectsDb, dt_project::{ThnData, ThnFilter}, dtos::{embedding::EmbeddingMatch, tensor::TensorRaw}, get_last_row,
    },
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
    embedding_service: Arc<OnceCell<EmbeddingService>>,
}

#[dtp_commands]
impl DTPService {
    pub fn new(app_handle: AppHandleWrapper) -> Self {
        let pdb = Arc::new(RwLock::new(None));
        let events = events::DTPEventsService::new();
        let scheduler = Arc::new(RwLock::new(None));
        let watch = Arc::new(RwLock::new(None));
        let dtm_protocol = Arc::new(OnceCell::new());
        let embedding_service = Arc::new(OnceCell::new());

        Self {
            app_handle,
            pdb: pdb,
            events,
            scheduler,
            watch,
            dtm_protocol,
            auto_watch: Arc::new(AtomicBool::new(false)),
            embedding_service,
        }
    }

    pub async fn connect(
        &self,
        channel: Channel<DTPEvent>,
        auto_watch: bool,
        db_path: String,
    ) -> anyhow::Result<()> {
        self.auto_watch.store(auto_watch, Ordering::Relaxed);
        let pdb = ProjectsDb::new(&db_path).await?;
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
        watch.watch_volumes().await?;
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
            .ok_or_else(|| anyhow::anyhow!("DB not ready"))
    }

    pub async fn dtm_protocol(&self) -> &DtmProtocol {
        self.dtm_protocol
            .get_or_init(|| async { DtmProtocol::new(self.get_db().await.unwrap()) })
            .await
    }

    #[dtp_command]
    pub async fn sync(&self) -> crate::TAResult<()> {
        let scheduler = self.scheduler.read().await;
        let scheduler = scheduler.as_ref().unwrap();
        scheduler.add_job(SyncJob::new(false));

        Ok(())
    }

    #[dtp_command]
    pub async fn sync_projects(
        &self,
        project_ids: Vec<i64>,
        check_deletions: bool,
    ) -> crate::TAResult<()> {
        for project_id in project_ids {
            let sync = ProjectSync::from_id(&self.get_db().await?, project_id).await?;
            self.add_job(UpdateProjectJob::new(&sync, false, check_deletions)?);
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
    ) -> crate::TAResult<()> {
        let db = self.get_db().await?;
        let scheduler = self
            .scheduler
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Scheduler not ready"))?;
        for project_id in project_ids {
            let sync = ProjectSync::from_id(&db, project_id).await?;
            let job = UpdateProjectJob::new(&sync, false, check_deletions)?;
            scheduler
                .add_job_front_and_wait(job)
                .await
                .map_err(|e| anyhow::anyhow!(e))?;
        }
        Ok(())
    }

    // test to compare checking rowid vs file metadata
    pub async fn check_all(&self) -> anyhow::Result<()> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await?;
        let mut last_rows: Vec<(i64, i64)> = Vec::new();
        for project in projects {
            let last_row = get_last_row(&project.full_path).await?;
            last_rows.push((project.id, last_row.0));
        }

        println!("Checked all projects: {:?}", last_rows);
        println!("Checked all projects: {}", start.elapsed().as_millis());
        Ok(())
    }

    pub async fn check_all_2(&self) -> anyhow::Result<()> {
        let start = std::time::Instant::now();
        let projects = self.list_projects(None).await?;
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

    async fn get_embedding_service(&self) -> crate::TAResult<&EmbeddingService> {
        let embedding_service = self
            .embedding_service
            .get_or_try_init::<anyhow::Error, _, _>(async || {
                let service = EmbeddingService::new(self.clone())?;
                Ok(service)
            })
            .await?;
        Ok(embedding_service)
    }

    #[dtp_command]
    pub async fn start_embedding(&self, project_id: i64) -> crate::TAResult<()> {
        let embedding_service = self.get_embedding_service().await?;

        let start = Instant::now();

        let pdb = self.get_db().await?;
        let dtp = pdb
            .open_dt_project(DtProjectRef::Id(project_id))
            .await
            .into_ta_result()?;

        let project = DtProjectRef::Db(dtp);
        let images: Vec<(i64, DtResourceHandle)> = self
            .list_images(
                Some(vec![project_id]),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?
            .images
            .unwrap_or(Vec::new())
            .iter()
            .map(|img| (img.id, project.node(img.node_id)))
            .collect();

        let total = images.len();
        embedding_service.clone().process_images(images).await?;

        println!(
            "{} images/{}seconds ({} s/image)",
            total,
            start.elapsed().as_secs(),
            start.elapsed().as_secs_f64() / total as f64
        );
        Ok(())
    }

    #[dtp_command]
    pub async fn get_embedding(&self, image_id: i64) -> crate::TAResult<Vec<EmbeddingMatch>> {
        let service = self.get_embedding_service().await?;
        let result = self.get_db().await?.embeddings().get(image_id).await?;
        let similar = self.get_db().await?.embeddings().find(result.1, 48, EmbeddingType::Image).await?;
        Ok(similar)
    }

    #[dtp_command]
    pub async fn search_embedding(&self, query: String) -> crate::TAResult<Vec<EmbeddingMatch>> {
        // let result = self.get_db().await?.embeddings().find(query, 48, EmbeddingType::Image).await?;
        // Ok(result)
        todo!();
    }

    #[dtp_command]
    pub async fn query(&self, query: String) -> crate::TAResult<()> {
        let pdb = self.get_db().await?;
        let rows = pdb
            .db
            .query_all_raw(sea_orm::Statement::from_string(
                pdb.db.get_database_backend(),
                query,
            ))
            .await
            .into_ta_result()?;

        for row in rows {
            if let Some(sqlx_row) = row.try_as_sqlite_row() {
                for column in sqlx_row.columns() {
                    print!("{} = ", column.name());

                    if let Ok(v) = sqlx_row.try_get::<Option<i64>, usize>(column.ordinal()) {
                        println!("{v:?}");
                    } else if let Ok(v) = sqlx_row.try_get::<Option<f64>, usize>(column.ordinal()) {
                        println!("{v:?}");
                    } else if let Ok(v) =
                        sqlx_row.try_get::<Option<String>, usize>(column.ordinal())
                    {
                        println!("{v:?}");
                    } else if let Ok(v) =
                        sqlx_row.try_get::<Option<Vec<u8>>, usize>(column.ordinal())
                    {
                        println!("<blob {} bytes>", v.map_or(0, |b| b.len()));
                    } else {
                        println!("<unknown>");
                    }
                }
            }

            println!();
        }
        Ok(())
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
    pub async fn lock_folder(&self, watchfolder_id: i64) -> crate::TAResult<()> {
        let folder = self
            .get_db()
            .await?
            .update_watch_folder(watchfolder_id, None, None, Some(true))
            .await
            .into_ta_result()?;
        self.stop_watch(&folder.path).await;
        projects_db::close_folder(&folder.path).await;
        self.events.emit(DTPEvent::WatchFoldersChanged);
        Ok(())
    }

    #[dtp_command]
    pub async fn reset_db(&self) -> crate::TAResult<()> {
        let db = self.get_db().await?;
        let folders = db.list_watch_folders().await.into_ta_result()?;
        let ids = folders.iter().map(|f| f.id).collect::<Vec<i64>>();
        db.remove_watch_folders(ids).await.into_ta_result()?;
        Ok(())
    }
}

#[dtm_command]
pub async fn dtp_test(state: State<'_, AppHandleWrapper>) -> crate::TAResult<()> {
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
) -> crate::TAResult<()> {
    let db_path = get_db_url(&app_handle);
    check_old_path(&app_handle);
    state.connect(channel, auto_watch, db_path).await?;
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
