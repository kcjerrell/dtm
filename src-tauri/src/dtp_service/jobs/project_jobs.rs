use std::sync::Arc;

use crate::dtp_service::{
    events::{DTPEvent, ScanProgress},
    jobs::{sync_folder::ProjectSync, Job, JobContext, JobResult},
};

pub struct AddProjectJob {
    pub path: String,
    pub watchfolder_id: i64,
    pub filesize: i64,
    pub modified: i64,
    pub is_import: bool,
}

impl AddProjectJob {
    pub fn new(project_sync: &ProjectSync, is_import: bool) -> Self {
        let file = project_sync.file.as_ref().unwrap();
        Self {
            path: file.path.to_string(),
            watchfolder_id: project_sync.watchfolder_id,
            filesize: file.filesize as i64,
            modified: file.modified.into(),
            is_import,
        }
    }
}

#[async_trait::async_trait]
impl Job for AddProjectJob {
    fn get_label(&self) -> String {
        format!("AddProjectJob for {}", self.path)
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let result = ctx.pdb.add_project(self.watchfolder_id, &self.path).await;

        if self.is_import {
            ctx.events.emit(DTPEvent::ImportProgress(ScanProgress {
                projects_found: 1,
                projects_scanned: 0,
                images_found: 0,
                images_scanned: 0,
            }));
        }

        match result {
            Ok(added_project) => {
                println!("Project added successfully");
                let id = added_project.id;
                ctx.events.emit(DTPEvent::ProjectAdded(added_project));
                Ok(JobResult::Subtasks(vec![Arc::new(UpdateProjectJob {
                    project_id: id,
                    filesize: self.filesize,
                    modified: self.modified,
                    is_import: self.is_import,
                })]))
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

pub struct RemoveProjectJob {
    pub project_id: i64,
}

impl RemoveProjectJob {
    pub fn new(project_sync: &ProjectSync) -> Result<Self, String> {
        if let Some(entity) = &project_sync.entity {
            Ok(Self {
                project_id: entity.id,
            })
        } else {
            Err("Project entity not found".to_string())
        }
    }
}

#[async_trait::async_trait]
impl Job for RemoveProjectJob {
    fn get_label(&self) -> String {
        format!("RemoveProjectJob for {}", self.project_id)
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let result = ctx
            .pdb
            .remove_project(self.project_id)
            .await
            .map_err(|e| e.to_string())?;
        Ok(JobResult::Event(DTPEvent::ProjectRemoved(result.unwrap())))
    }
}

pub struct UpdateProjectJob {
    pub project_id: i64,
    pub filesize: i64,
    pub modified: i64,
    pub is_import: bool,
}

impl UpdateProjectJob {
    pub fn new(project_sync: &ProjectSync, is_import: bool) -> Result<Self, String> {
        if let Some(entity) = &project_sync.entity {
            Ok(Self {
                project_id: entity.id,
                filesize: project_sync.file.as_ref().unwrap().filesize as i64,
                modified: project_sync.file.as_ref().unwrap().modified,
                is_import,
            })
        } else {
            Err("Project entity not found".to_string())
        }
    }
}

#[async_trait::async_trait]
impl Job for UpdateProjectJob {
    fn get_label(&self) -> String {
        format!("UpdateProjectJob for {}", self.project_id)
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let result: Result<(i64, u64), String> = ctx
            .pdb
            .scan_project(self.project_id, false)
            .await
            .map_err(|e| e.to_string());

        match result {
            Ok((_id, total)) => {
                let project = ctx.pdb.get_project(_id).await.map_err(|e| e.to_string())?;

                let _ = ctx
                    .pdb
                    .update_project(project.id, Some(self.filesize), Some(self.modified))
                    .await
                    .map_err(|e| e.to_string())?;

                match self.is_import {
                    true => Ok(JobResult::Event(DTPEvent::ImportProgress(ScanProgress {
                        projects_found: 0,
                        projects_scanned: 1,
                        images_found: 0,
                        images_scanned: total,
                    }))),
                    false => Ok(JobResult::Event(DTPEvent::ProjectUpdated(project))),
                }
            }
            Err(err) => {
                log::error!("Error scanning project {}: {}", self.project_id, err);
                Err(err.to_string())
            }
        }
    }
}
