use std::{path::PathBuf, sync::Arc};

use futures::StreamExt;
use tauri::State;
use tokio::{sync::Semaphore, task::JoinSet};

use crate::{
    dtp_service::AppHandleWrapper,
    projects_db::{DTProject, DtProjectRef},
    ResourceHandle, TAResult, Tensor,
};

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    project_path: &str,
) -> TAResult<()> {
    let archiver = Archiver::new(app, project_path, project_path).await?;
    archiver.proc_tensors().await?;
    Ok(())
}

struct ProcItem {
    row_id: i64,
    tensor_name: String,
    tensor: Tensor,
}

struct WriteItem {
    row_id: i64,
    tensor_name: String,
    data: Vec<u8>,
}

pub struct Archiver {
    app_handle: tauri::AppHandle,
    project: Arc<DTProject>,
    project_ref: DtProjectRef,
    dest_path: String,
    source_path: PathBuf,
    tempdir: tempfile::TempDir,
}

impl Archiver {
    pub async fn new(
        app: State<'_, AppHandleWrapper>,
        source_path: &str,
        dest_path: &str,
    ) -> anyhow::Result<Self> {
        // TODO: check that source project is not in use (lsof filename?)
        let source = PathBuf::from(source_path);
        if !source.exists() {
            anyhow::bail!("Source project does not exist: {}", source_path);
        }

        // create a temp folder to work in
        let mut temp_dir = tempfile::tempdir_in(&app.get_app_data_dir()?)?;
        temp_dir.disable_cleanup(true);
        let temp_path = temp_dir.path();

        // copy the project
        tokio::fs::copy(source_path, temp_path.join("project.sqlite")).await?;

        // copy the wal file if it exists
        let wal_path = source.with_extension("sqlite-wal");
        if wal_path.exists() {
            tokio::fs::copy(wal_path, temp_path.join("project.sqlite-wal")).await?;
        }

        let dt_project = DTProject::open_mut(
            &temp_path
                .join("project.sqlite")
                .to_string_lossy()
                .to_string(),
        )
        .await?;
        let project = Arc::new(dt_project);
        let project_ref = DtProjectRef::Db(project.clone());

        Ok(Self {
            app_handle: app.app_handle.clone().unwrap(),
            project,
            project_ref,
            dest_path: dest_path.to_string(),
            source_path: source,
            tempdir: temp_dir,
        })
    }

    async fn proc_nodes(&self) -> Anyhow::Result<()> {
        
    }

    async fn proc_tensors(&self) -> anyhow::Result<()> {
        let mut tasks: JoinSet<anyhow::Result<()>> = JoinSet::new();
        let semaphore = Arc::new(Semaphore::new(8));

        let tensors = self.project.list_tensors().await?;
        let max = tensors.iter().map(|(n, _)| *n).max().unwrap_or(0);
        let pad = max.to_string().len();
        let total = tensors.len();

        let tensors_dir = self.tempdir.path().join("tensors");
        tokio::fs::create_dir_all(&tensors_dir).await?;

        for (row_id, tensor_name) in tensors {
            let tensor_ref = self.project_ref.tensor(&tensor_name);
            let semaphore = semaphore.clone();
            let filename = format!("{:0pad$}_{}", row_id, tensor_name, pad = pad);
            let dest_path = tensors_dir.join(&filename).with_extension("png");

            tasks.spawn(async move {
                let _permit = semaphore.acquire_owned().await?;
                let tensor = match tensor_ref.get_tensor().await? {
                    Some(tensor) => tensor,
                    None => anyhow::bail!("Tensor {} not found", tensor_name),
                };

                let png: anyhow::Result<Vec<u8>> = tokio::task::spawn_blocking(move || {
                    let png = tensor.to_png(None, None)?;
                    Ok(png)
                })
                .await?;

                if let Ok(png) = png {
                    tokio::fs::write(&dest_path, png).await?;
                }
                Ok(())
            });
        }

        let mut count = 0;
        while let Some(result) = tasks.join_next().await {
            if let Err(e) = result {
                log::error!("Failed to process tensor: {}", e);
            }
            count += 1;
            if count % 20 == 0 {
                log::info!("Processed {} tensors of {}", count, total);
            }
        }

        log::info!("Processed {} tensors of {}", count, total);
        Ok(())
    }
}
