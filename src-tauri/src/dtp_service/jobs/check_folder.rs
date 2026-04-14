use std::{fs, sync::Arc};

use crate::{
    dtp_service::{
        events::DTPEvent,
        jobs::{
            maintenance::run_maintenance, sync_folder::SyncFolderJob, CheckFileJob, Job,
            JobContext, JobResult,
        },
    },
    projects_db::{dtos::watch_folder::WatchFolderDTO, folder_cache, ProjectsDb},
};

#[derive(Debug, Clone)]
pub struct CheckFolderJob {
    watchfolder: Option<WatchFolderDTO>,
    path: String,
    /// reset is_locked for watchfolder
    reset_lock: bool,
    /// indicates that a SyncFolderJob should follow. overrides check_files if both are present
    sync: bool,
    /// if triggered by the watcher, it should follow with CheckFileJobs
    check_files: Option<Vec<String>>,
}

impl CheckFolderJob {
    pub fn new(
        watchfolder: WatchFolderDTO,
        reset_lock: bool,
        sync: bool,
        check_files: Option<Vec<String>>,
    ) -> Self {
        Self {
            path: watchfolder.path.clone(),
            watchfolder: Some(watchfolder),
            reset_lock,
            sync,
            check_files,
        }
    }

    pub fn new_from_path(
        path: String,
        reset_lock: bool,
        sync: bool,
        check_files: Option<Vec<String>>,
    ) -> Self {
        Self {
            watchfolder: None,
            path,
            reset_lock,
            sync,
            check_files,
        }
    }
}

#[async_trait::async_trait]
impl Job for CheckFolderJob {
    fn get_label(&self) -> String {
        format!("CheckFolderJob for {}", self.path)
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        ctx.dtp.stop_watch(&self.path).await;

        let mut locked_update: Option<bool> = None;
        let mut missing_update: Option<bool> = None;

        let watchfolder = match &self.watchfolder {
            Some(wf) => wf,
            None => &ctx.pdb.get_watch_folder_by_path(&self.path).await?.unwrap(),
        };

        let resolved = resolve_folder(&watchfolder, &ctx.pdb)
            .await
            .unwrap_or(false);

        // check existence of folder
        let is_missing = !resolved || !fs::exists(&watchfolder.path).unwrap_or(false);

        // if DTO.missing is different, update folder and all projects
        if watchfolder.is_missing != is_missing {
            missing_update = Some(is_missing);
        }

        if watchfolder.is_locked && self.reset_lock {
            locked_update = Some(false);
        }

        if locked_update.is_some() || missing_update.is_some() {
            ctx.pdb
                .update_watch_folder(watchfolder.id, None, missing_update, locked_update)
                .await?;
            ctx.events.emit(DTPEvent::ProjectsChanged);
        }

        if is_missing {
            return Ok(JobResult::None);
        }

        // run maintenance tasks (if any) before scheduling follow-up work
        if watchfolder.maint > 0 {
            log::info!("Required maintenance for folder {}", watchfolder.path);
            run_maintenance(watchfolder.maint, watchfolder, ctx).await?;
        }

        if self.sync {
            return Ok(JobResult::Subtasks(vec![Arc::new(SyncFolderJob::new(
                &watchfolder,
            ))]));
        }

        if let Some(files) = &self.check_files {
            let jobs: Vec<Arc<dyn Job>> = files
                .iter()
                .map(|f| Arc::new(CheckFileJob::new(f.to_string())) as Arc<dyn Job>)
                .collect();
            return Ok(JobResult::Subtasks(jobs));
        }

        Ok(JobResult::None)
    }

    async fn on_complete(&self, ctx: &JobContext) {
        ctx.dtp.resume_watch(&self.path, true).await;
    }

    async fn on_failed(&self, ctx: &JobContext, _error: String) {
        ctx.dtp.resume_watch(&self.path, true).await;
    }
}

impl Into<Arc<dyn Job>> for CheckFolderJob {
    fn into(self) -> Arc<dyn Job> {
        Arc::new(self)
    }
}

async fn resolve_folder(folder: &WatchFolderDTO, db: &ProjectsDb) -> Result<bool, String> {
    let cached = folder_cache::get_folder(folder.id);
    if let Some(cached) = cached {
        if cached == folder.path {
            return Ok(true);
        }
    }
    let resolved = folder_cache::resolve_bookmark(folder.id, &folder.bookmark).await;
    if let Ok(resolved) = resolved {
        match resolved {
            crate::bookmarks::ResolveResult::Resolved(updated_path) => {
                if updated_path != folder.path {
                    db.update_bookmark_path(folder.id, &folder.bookmark, &updated_path)
                        .await
                        .unwrap();
                }
            }
            crate::bookmarks::ResolveResult::StaleRefreshed {
                new_bookmark,
                resolved_path,
            } => {
                db.update_bookmark_path(folder.id, &new_bookmark, &resolved_path)
                    .await
                    .unwrap();
            }
            crate::bookmarks::ResolveResult::CannotResolve => {
                // TODO: Mark as missing in DB?
                return Ok(false);
            }
        }
    }
    Ok(true)
}
