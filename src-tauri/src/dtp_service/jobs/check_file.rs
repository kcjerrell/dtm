use crate::dtp_service::{
    helpers::inspect_project_file,
    jobs::{
        AddProjectJob, Job, JobContext, JobResult, ProjectSync, RemoveProjectJob, UpdateProjectJob,
    },
};
use std::{path::Path, sync::Arc};

pub struct CheckFileJob {
    pub project_path: String,
}
impl CheckFileJob {
    pub fn new(project_path: String) -> Self {
        Self { project_path }
    }
}
#[async_trait::async_trait]
impl Job for CheckFileJob {
    fn get_label(&self) -> String {
        format!("Check file {}", self.project_path)
    }
    async fn folder_scope(&self, ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(ctx
            .pdb
            .get_watch_folder_for_path(&self.project_path)
            .await
            .map_err(|e| e.to_string())?
            .map(|f| f.id))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        let Some(folder) = ctx
            .pdb
            .get_watch_folder_for_path(&self.project_path)
            .await
            .map_err(|e| e.to_string())?
        else {
            return Ok(JobResult::None);
        };
        if folder.is_locked || folder.is_missing {
            return Ok(JobResult::None);
        }
        let path = Path::new(&self.project_path)
            .strip_prefix(&folder.path)
            .map_err(|e| e.to_string())?;
        if !folder.recursive.unwrap_or(false) && path.components().count() > 1 {
            return Ok(JobResult::None);
        }
        let entity = ctx
            .pdb
            .get_project_by_path(folder.id, &path.to_string_lossy())
            .await
            .map_err(|e| e.to_string())?;
        let file = inspect_project_file(Path::new(&self.project_path), &folder.path, folder.id)
            .map_err(|e| format!("{e:#}"))?;
        let sync = ProjectSync::new(entity, file, folder.id, folder.path);
        let job: Option<Arc<dyn Job>> = match (&sync.entity, &sync.file) {
            (Some(_), None) => Some(Arc::new(
                RemoveProjectJob::new(&sync).map_err(|e| e.to_string())?,
            )),
            (None, Some(_)) => Some(Arc::new(
                AddProjectJob::new(&sync, false).map_err(|e| e.to_string())?,
            )),
            (Some(entity), Some(file))
                if !entity.excluded
                    && (entity.filesize != Some(file.filesize as i64)
                        || entity.modified != Some(file.modified)) =>
            {
                Some(Arc::new(
                    UpdateProjectJob::new(&sync, false, false).map_err(|e| e.to_string())?,
                ))
            }
            _ => None,
        };
        Ok(job.map_or(JobResult::None, |job| JobResult::Subtasks(vec![job])))
    }
}
