use std::{fs, sync::Arc};

use crate::{
    dtp_service::{
        events::DTPEvent,
        jobs::{sync_folder::SyncFolderJob, CheckFileJob, Job, JobContext, JobResult},
    },
    projects_db::dtos::watch_folder::WatchFolderDTO,
};

#[derive(Debug)]
pub struct CheckFolderJob {
    watchfolder: WatchFolderDTO,
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
            watchfolder,
            reset_lock,
            sync,
            check_files,
        }
    }
}

#[async_trait::async_trait]
impl Job for CheckFolderJob {
    fn get_label(&self) -> String {
        format!("CheckFolderJob for {}", self.watchfolder.path)
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let mut locked_update: Option<bool> = None;
        let mut missing_update: Option<bool> = None;

        // check existence of folder
        let is_missing = !fs::exists(&self.watchfolder.path).unwrap_or(false);

        // if DTO.missing is different, update folder and all projects
        if self.watchfolder.is_missing != is_missing {
            missing_update = Some(is_missing);
        }

        if self.watchfolder.is_locked && self.reset_lock {
            locked_update = Some(false);
        }

        if locked_update.is_some() || missing_update.is_some() {
            ctx.pdb
                .update_watch_folder(self.watchfolder.id, locked_update, missing_update, None)
                .await?;
            ctx.events.emit(DTPEvent::ProjectsChanged);
        }

        if is_missing {
            return Ok(JobResult::None);
        }

        if self.sync {
            return Ok(JobResult::Subtasks(vec![Arc::new(SyncFolderJob::new(
                &self.watchfolder,
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

    async fn on_complete(&self, _ctx: &JobContext) {}
    async fn on_failed(&self, _ctx: &JobContext, _error: String) {}
}

impl Into<Arc<dyn Job>> for CheckFolderJob {
    fn into(self) -> Arc<dyn Job> {
        Arc::new(self)
    }
}
