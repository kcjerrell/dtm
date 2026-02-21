use std::{fs, sync::Arc};

use crate::dtp_service::{
    helpers::system_time_to_epoch_secs,
    jobs::{AddProjectJob, Job, JobContext, JobResult, RemoveProjectJob, UpdateProjectJob},
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
        let watchfolder = ctx
            .pdb
            .get_watch_folder_for_path(&self.project_path)
            .await
            .unwrap();
        if watchfolder.is_none() {
            return Err("Watch folder not found".to_string());
        }
        let watchfolder = watchfolder.unwrap();
        let project_path = self
            .project_path
            .strip_prefix(format!("{}/", watchfolder.path).as_str())
            .unwrap();
        println!("checking {} in {}", project_path, watchfolder.path);
        let entity = ctx
            .pdb
            .get_project_by_path(watchfolder.id, &project_path)
            .await
            .map_err(|e| e.to_string())?;

        if !fs::exists(&self.project_path).unwrap_or(false) {
            println!("File does not exist: {}", self.project_path);
            match entity {
                Some(entity) => {
                    println!("Removing project: {}", entity.id);
                    let job = RemoveProjectJob {
                        project_id: entity.id,
                    };
                    return Ok(JobResult::Subtasks(vec![Arc::new(job)]));
                }
                None => {
                    println!("File does not exist and no project found");
                    return Ok(JobResult::None);
                }
            }
        }

        let metadata = fs::metadata(&self.project_path).unwrap();
        let filesize = metadata.len() as i64;
        let modified = system_time_to_epoch_secs(metadata.modified().unwrap());

        match entity {
            // if an entity was found, compare size and modified
            Some(entity) => {
                println!("Project found for path: {}", self.project_path);
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
                println!("No project found for path: {}", self.project_path);
                let job = AddProjectJob {
                    path: project_path.to_string(),
                    watchfolder_id: watchfolder.id,
                    filesize,
                    modified: modified.unwrap_or(0),
                    is_import: false,
                };
                println!("Adding project: {}", self.project_path);
                return Ok(JobResult::Subtasks(vec![Arc::new(job)]));
            }
        }

        Ok(JobResult::None)
    }
}
