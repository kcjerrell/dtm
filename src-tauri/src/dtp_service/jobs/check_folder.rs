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
use anyhow::{Context, Result};

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

    async fn folder_scope(&self, ctx: &JobContext) -> Result<Option<i64>, String> {
        if let Some(folder) = &self.watchfolder {
            return Ok(Some(folder.id));
        }
        Ok(ctx
            .pdb
            .get_watch_folder_by_path(&self.path)
            .await
            .map_err(|e| e.to_string())?
            .map(|f| f.id))
    }

    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        self.check(ctx).await.map_err(|e| format!("{e:#}"))
    }
}

impl CheckFolderJob {
    async fn check(&self, ctx: &JobContext) -> Result<JobResult> {
        let current = match &self.watchfolder {
            Some(folder) => ctx.pdb.get_watch_folder(folder.id).await?,
            None => ctx.pdb.get_watch_folder_by_path(&self.path).await?,
        };
        let Some(mut folder) = current else {
            return Ok(JobResult::None);
        };
        if folder.is_locked && !self.reset_lock {
            ctx.dtp.stop_watch(&folder.path).await;
            return Ok(JobResult::None);
        }
        let previous_path = folder.path.clone();
        let resolved = resolve_folder(&folder, &ctx.pdb).await?;
        folder = ctx
            .pdb
            .get_watch_folder(folder.id)
            .await?
            .context("watch folder removed")?;
        if previous_path != folder.path {
            ctx.dtp.stop_watch(&previous_path).await;
        }
        let missing = if !resolved {
            true
        } else {
            match fs::metadata(&folder.path) {
                Ok(metadata) => !metadata.is_dir(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
                Err(error) => {
                    return Err(error)
                        .with_context(|| format!("failed to inspect watch folder {}", folder.path))
                }
            }
        };
        if folder.is_missing != missing || (folder.is_locked && self.reset_lock) {
            folder = ctx
                .pdb
                .update_watch_folder(
                    folder.id,
                    None,
                    Some(missing),
                    self.reset_lock.then_some(false),
                )
                .await?;
            ctx.events.emit(DTPEvent::WatchFoldersChanged);
            ctx.events.emit(DTPEvent::ProjectsChanged);
        }
        if missing || folder.is_locked {
            ctx.dtp.stop_watch(&folder.path).await;
            crate::dt_project::close_folder(&folder.path).await;
            crate::archive::DTZipCache::close_folder(&folder.path).await?;
            return Ok(JobResult::None);
        }
        // Subscribe before discovery and leave the watcher running. Events that
        // arrive during this tree are queued behind its folder lease.
        ctx.dtp
            .resume_watch(&folder.path, folder.recursive.unwrap_or(false))
            .await?;
        if folder.maint > 0 {
            run_maintenance(folder.maint, &folder, ctx).await?;
        }
        if self.sync || previous_path != folder.path {
            return Ok(JobResult::Subtasks(vec![Arc::new(SyncFolderJob::new(
                &folder,
            ))]));
        }
        if let Some(files) = &self.check_files {
            let unique: std::collections::HashSet<_> = files.iter().collect();
            return Ok(JobResult::Subtasks(
                unique
                    .into_iter()
                    .map(|f| Arc::new(CheckFileJob::new(f.clone())) as Arc<dyn Job>)
                    .collect(),
            ));
        }
        Ok(JobResult::None)
    }
}

impl From<CheckFolderJob> for Arc<dyn Job> {
    fn from(val: CheckFolderJob) -> Self {
        Arc::new(val)
    }
}

async fn resolve_folder(folder: &WatchFolderDTO, db: &ProjectsDb) -> Result<bool> {
    let resolved = folder_cache::resolve_bookmark(folder.id, &folder.bookmark).await?;
    match resolved {
        crate::bookmarks::ResolveResult::Resolved(path) => {
            if path != folder.path {
                db.update_bookmark_path(folder.id, &folder.bookmark, &path)
                    .await?;
            }
        }
        crate::bookmarks::ResolveResult::StaleRefreshed {
            new_bookmark,
            resolved_path,
        } => {
            db.update_bookmark_path(folder.id, &new_bookmark, &resolved_path)
                .await?;
        }
        crate::bookmarks::ResolveResult::CannotResolve => return Ok(false),
    }
    Ok(true)
}
