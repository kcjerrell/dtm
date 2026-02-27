use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::{
    dtp_service::{
        events::DTPEvent,
        helpers::{get_folder_files, get_full_project_path, ProjectFile},
        jobs::{AddProjectJob, Job, JobContext, JobResult, RemoveProjectJob, UpdateProjectJob},
    },
    projects_db::dtos::{project::ProjectExtra, watch_folder::WatchFolderDTO},
};

pub struct SyncFolderJob {
    pub watchfolder_id: i64,
    pub watchfolder_path: String,
    pub is_import: Arc<AtomicBool>,
}

impl SyncFolderJob {
    pub fn new(watchfolder: &WatchFolderDTO) -> Self {
        Self {
            watchfolder_id: watchfolder.id,
            watchfolder_path: watchfolder.path.clone(),
            is_import: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait::async_trait]
impl Job for SyncFolderJob {
    fn get_label(&self) -> String {
        format!(
            "SyncFolderJob for {} ({})",
            self.watchfolder_path, self.watchfolder_id
        )
    }
    fn start_event(self: &Self) -> Option<DTPEvent> {
        Some(DTPEvent::FolderSyncStarted(self.watchfolder_id))
    }
    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let files = get_folder_files(&self.watchfolder_path, self.watchfolder_id).await;
        let mut project_files = files.projects;
        let mut sync_projects: Vec<ProjectSync> = Vec::new();
        let entities = ctx
            .pdb
            .list_projects(Some(self.watchfolder_id))
            .await
            .unwrap();

        // detect if this is a new folder import
        let is_import = entities.is_empty() && !project_files.is_empty();
        if is_import {
            ctx.events.emit(DTPEvent::ImportStarted);
            self.is_import.store(true, Ordering::Relaxed);
        }

        for entity in entities {
            let full_path = get_full_project_path(&entity);
            let file = project_files.remove(&full_path);

            let sync = ProjectSync::new(
                Some(entity),
                file,
                self.watchfolder_id,
                self.watchfolder_path.clone(),
            );
            sync_projects.push(sync);
        }

        for (_key, file) in project_files.drain() {
            let sync = ProjectSync::new(
                None,
                Some(file),
                self.watchfolder_id,
                self.watchfolder_path.clone(),
            );
            sync_projects.push(sync);
        }

        let mut subtasks: Vec<Arc<dyn Job>> = Vec::new();

        for sync in sync_projects.iter_mut() {
            sync.assign_sync_action();

            match sync.action {
                SyncAction::Add => {
                    subtasks.push(Arc::new(AddProjectJob::new(
                        &sync,
                        self.is_import.load(Ordering::Relaxed),
                    )));
                }
                SyncAction::Remove => {
                    match RemoveProjectJob::new(&sync) {
                        Ok(job) => subtasks.push(Arc::new(job)),
                        Err(e) => log::error!("Failed to create RemoveProjectJob: {}", e),
                    };
                }
                SyncAction::Update => {
                    subtasks.push(Arc::new(
                        UpdateProjectJob::new(&sync, self.is_import.load(Ordering::Relaxed))
                            .unwrap(),
                    ));
                }
                _ => {}
            };
        }

        Ok(JobResult::Subtasks(subtasks))
    }

    async fn on_complete(self: &Self, ctx: &JobContext) {
        if self.is_import.load(Ordering::Relaxed) {
            ctx.events.emit(DTPEvent::ImportCompleted);
        }
        ctx.events
            .emit(DTPEvent::FolderSyncComplete(self.watchfolder_id));
    }
}

#[derive(Default, Debug, PartialEq, Eq, Clone)]
pub enum SyncAction {
    #[default]
    None = 0,
    Add,
    Remove,
    Update,
}

#[derive(Debug, Clone)]
pub struct ProjectSync {
    pub entity: Option<ProjectExtra>,
    pub file: Option<ProjectFile>,
    pub action: SyncAction,
    pub watchfolder_id: i64,
    pub watchfolder_path: String,
}

impl ProjectSync {
    pub fn new(
        entity: Option<ProjectExtra>,
        file: Option<ProjectFile>,
        watchfolder_id: i64,
        watchfolder_path: String,
    ) -> Self {
        let sync = Self {
            entity,
            file,
            action: SyncAction::None,
            watchfolder_id,
            watchfolder_path,
        };
        sync
    }

    fn assign_sync_action(&mut self) {
        if self.entity.is_none() && self.file.is_some() {
            self.action = SyncAction::Add;
            return;
        }
        if self.entity.is_some() && self.file.is_none() {
            self.action = SyncAction::Remove;
            return;
        }
        if self.entity.is_none() && self.file.is_none() {
            return;
        }
        if let (Some(entity), Some(file)) = (self.entity.as_ref(), self.file.as_ref()) {
            if file.filesize != entity.filesize.unwrap_or(0) as u64
                || file.modified != entity.modified.unwrap_or(0) as i64
            {
                self.action = SyncAction::Update;
            }
        }
    }
}
