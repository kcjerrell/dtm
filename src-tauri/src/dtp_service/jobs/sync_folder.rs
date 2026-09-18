use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use anyhow::Context;
use std::path::Path;

use crate::{
    dtp_service::{
        events::DTPEvent,
        helpers::{get_folder_files, inspect_project_file, ProjectFile},
        jobs::{
            AddProjectJob, Job, JobContext, JobResult, RemoveProjectJob, SyncModelsJob,
            UpdateProjectJob,
        },
    },
    projects_db::{
        dtos::{project::ProjectExtra, watch_folder::WatchFolderDTO},
        ProjectsDb,
    },
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
    async fn folder_scope(&self, _ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(Some(self.watchfolder_id))
    }
    fn start_event(&self) -> Option<DTPEvent> {
        Some(DTPEvent::FolderSyncStarted(self.watchfolder_id))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        let Some(folder) = ctx
            .pdb
            .get_watch_folder(self.watchfolder_id)
            .await
            .map_err(|e| e.to_string())?
        else {
            return Ok(JobResult::None);
        };
        if folder.is_missing || folder.is_locked {
            return Ok(JobResult::None);
        }
        let files = get_folder_files(&folder.path, folder.id, folder.recursive.unwrap_or(false))
            .await
            .map_err(|e| format!("{e:#}"))?;
        let mut project_files = files.projects;
        let mut sync_projects: Vec<ProjectSync> = Vec::new();
        let entities = ctx
            .pdb
            .list_projects(Some(self.watchfolder_id))
            .await
            .map_err(|e| e.to_string())?;

        // detect if this is a new folder import
        let is_import = entities.is_empty() && !project_files.is_empty();
        if is_import {
            ctx.events.emit(DTPEvent::ImportStarted);
            self.is_import.store(true, Ordering::Relaxed);
        }

        for entity in entities {
            let full_path = Path::new(&folder.path)
                .join(&entity.path)
                .to_string_lossy()
                .into_owned();
            if !folder.recursive.unwrap_or(false)
                && Path::new(&entity.path).components().count() > 1
            {
                continue;
            }
            let file = project_files.remove(&full_path);

            let sync =
                ProjectSync::new(Some(entity), file, self.watchfolder_id, folder.path.clone());
            sync_projects.push(sync);
        }

        for (_key, file) in project_files.drain() {
            let sync = ProjectSync::new(None, Some(file), self.watchfolder_id, folder.path.clone());
            sync_projects.push(sync);
        }

        let mut subtasks: Vec<Arc<dyn Job>> = Vec::new();

        for sync in sync_projects.iter_mut() {
            sync.assign_sync_action();

            match sync.action {
                SyncAction::Add => {
                    subtasks.push(Arc::new(
                        AddProjectJob::new(sync, self.is_import.load(Ordering::Relaxed))
                            .map_err(|e| format!("{e:#}"))?,
                    ));
                }
                SyncAction::Remove => {
                    match RemoveProjectJob::new(sync) {
                        Ok(job) => subtasks.push(Arc::new(job)),
                        Err(e) => log::error!("Failed to create RemoveProjectJob: {}", e),
                    };
                }
                SyncAction::Update => {
                    subtasks.push(Arc::new(
                        UpdateProjectJob::new(sync, self.is_import.load(Ordering::Relaxed), false)
                            .map_err(|e| format!("{e:#}"))?,
                    ));
                }
                _ => {}
            };
        }

        if !files.model_info.is_empty() {
            subtasks.push(Arc::new(SyncModelsJob::new(
                files.model_info.into_iter().map(|m| m.into()).collect(),
            )));
        }

        Ok(JobResult::Subtasks(subtasks))
    }

    async fn on_complete(&self, ctx: &JobContext) {
        if self.is_import.load(Ordering::Relaxed) {
            ctx.events.emit(DTPEvent::ImportCompleted);
        }
        ctx.events
            .emit(DTPEvent::FolderSyncComplete(self.watchfolder_id));
    }

    async fn on_failed(&self, ctx: &JobContext, _error: String) {
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
        Self {
            entity,
            file,
            action: SyncAction::None,
            watchfolder_id,
            watchfolder_path,
        }
    }

    pub async fn from_id(pdb: &ProjectsDb, project_id: i64) -> anyhow::Result<Self> {
        let entity = pdb.get_project(project_id).await?;

        let folder = pdb
            .get_watch_folder(entity.watchfolder_id)
            .await?
            .context("watch folder not found")?;
        let project = inspect_project_file(Path::new(&entity.full_path), &folder.path, folder.id)?;
        Ok(Self {
            watchfolder_id: entity.watchfolder_id,
            entity: Some(entity),
            file: project,
            action: SyncAction::None,
            watchfolder_path: folder.path,
        })
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
            if !entity.excluded && has_changed(file, entity) {
                self.action = SyncAction::Update;
            }
        }
    }
}

fn has_changed(file: &ProjectFile, entity: &ProjectExtra) -> bool {
    file.filesize != entity.filesize.unwrap_or(0) as u64
        || file.modified != entity.modified.unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_change_detection_includes_modification_time() {
        let file = ProjectFile {
            path: "project.dtm.zip".into(),
            filesize: 100,
            modified: 20,
            _watchfolder_id: 1,
            has_base: true,
            is_archive: true,
        };
        let mut entity = ProjectExtra {
            id: 1,
            fingerprint: String::new(),
            path: file.path.clone(),
            watchfolder_id: 1,
            image_count: None,
            last_id: None,
            filesize: Some(100),
            modified: Some(19),
            excluded: false,
            name: String::new(),
            full_path: String::new(),
            is_missing: false,
            is_locked: false,
        };
        assert!(has_changed(&file, &entity));
        entity.modified = Some(20);
        assert!(!has_changed(&file, &entity));
    }
}
