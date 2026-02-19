use std::{fs, sync::Arc};

use crate::dtp_service::{
    helpers::system_time_to_epoch_secs,
    jobs::{AddProjectJob, Job, JobContext, JobResult, UpdateProjectJob},
};

pub struct CheckFileJob {
    pub project_path: String,
}

#[async_trait::async_trait]
impl Job for CheckFileJob {
    fn get_label(&self) -> String {
        "Check file".to_string()
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let metadata = fs::metadata(&self.project_path).unwrap();
        let filesize = metadata.len() as i64;
        let modified = system_time_to_epoch_secs(metadata.modified().unwrap());

        let entity = ctx
            .pdb
            .get_project_by_path(&self.project_path)
            .await
            .map_err(|e| e.to_string())?;

        match entity {
            // if an entity was found, compare size and modified
            Some(entity) => {
                if entity.filesize.unwrap_or(0) != filesize || entity.modified != modified {
                    let job = UpdateProjectJob {
                        project_id: entity.id,
                        filesize: filesize,
                        modified: modified.unwrap_or(0),
                        is_import: false,
                    };
                    return Ok(JobResult::Subtasks(vec![Arc::new(job)]));
                }
            }
            None => {
                let watchfolder = ctx
                    .pdb
                    .get_watch_folder_for_path(&self.project_path)
                    .await
                    .unwrap();
                if watchfolder.is_none() {
                    return Err("Watch folder not found".to_string());
                }
                let job = AddProjectJob {
                    path: self.project_path.clone(),
                    watchfolder_id: watchfolder.unwrap().id,
                    filesize,
                    modified: modified.unwrap_or(0),
                    is_import: false,
                };
                return Ok(JobResult::Subtasks(vec![Arc::new(job)]));
            }
        }

        Ok(JobResult::None)
    }
}
