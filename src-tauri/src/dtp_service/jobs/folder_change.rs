use crate::dtp_service::{
    events::DTPEvent,
    jobs::{Job, JobContext, JobResult, UpdateProjectJob},
};
use std::sync::Arc;

pub enum FolderChange {
    Remove,
    Lock,
    Recursion(bool),
    Exclude { project_id: i64, exclude: bool },
}
pub struct FolderChangeJob {
    pub folder_id: i64,
    pub change: FolderChange,
}
#[async_trait::async_trait]
impl Job for FolderChangeJob {
    fn get_label(&self) -> String {
        format!("Change watch folder {}", self.folder_id)
    }
    async fn folder_scope(&self, _ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(Some(self.folder_id))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        self.apply(ctx).await.map_err(|e| format!("{e:#}"))
    }
}
impl FolderChangeJob {
    async fn apply(&self, ctx: &JobContext) -> anyhow::Result<JobResult> {
        let Some(folder) = ctx.pdb.get_watch_folder(self.folder_id).await? else {
            return Ok(JobResult::None);
        };
        match self.change {
            FolderChange::Remove => {
                ctx.dtp.stop_watch(&folder.path).await;
                ctx.pdb.remove_watch_folders(&[folder.id]).await?;
            }
            FolderChange::Lock => {
                ctx.pdb
                    .update_watch_folder(folder.id, None, None, Some(true))
                    .await?;
                ctx.dtp.stop_watch(&folder.path).await;
                crate::dt_project::close_folder(&folder.path).await;
                crate::archive::DTZipCache::close_folder(&folder.path).await?;
            }
            FolderChange::Recursion(recursive) => {
                ctx.pdb
                    .update_watch_folder(folder.id, Some(recursive), None, None)
                    .await?;
                ctx.dtp.stop_watch(&folder.path).await;
                if !folder.is_missing && !folder.is_locked {
                    ctx.dtp.resume_watch(&folder.path, recursive).await?;
                }
            }
            FolderChange::Exclude {
                project_id,
                exclude,
            } => {
                ctx.pdb.update_exclude(project_id, exclude).await?;
                ctx.events.emit(DTPEvent::ProjectUpdated(
                    ctx.pdb.get_project(project_id).await?,
                ));
                if !exclude {
                    let job = UpdateProjectJob::from_id(&ctx.pdb, project_id, false, false).await?;
                    return Ok(JobResult::Subtasks(vec![Arc::new(job)]));
                }
                return Ok(JobResult::None);
            }
        }
        ctx.events.emit(DTPEvent::WatchFoldersChanged);
        ctx.events.emit(DTPEvent::ProjectsChanged);
        Ok(JobResult::None)
    }
}
