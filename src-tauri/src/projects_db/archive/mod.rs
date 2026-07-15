use std::{collections::HashSet, path::PathBuf, sync::Arc};

use futures::StreamExt;
use tauri::State;
use tokio::{sync::Semaphore, task::JoinSet};

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        archive::copy::copy_project,
        dt_project::{ThnData, ThnFilter},
        DTProject, DtProjectRef,
    },
    IntoTAResult, ResourceHandle, TAResult, Tensor,
};

mod copy;

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<()> {
    copy_project(app.inner().clone(), DtProjectRef::Id(project_id)).await?;
    Ok(())
}

#[tauri::command]
pub async fn create_dt_archivex(
    app: State<'_, AppHandleWrapper>,
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<Vec<String>> {
    // let archiver = Archiver::new(app, project_path, project_path).await?;
    // archiver.proc_tensors().await?;
    // Ok(())
    let db = dtp.get_db().await.map_err(|e| anyhow::anyhow!(e))?;
    let project = db
        .open_dt_project(DtProjectRef::Id(project_id))
        .await
        .into_ta_result()?;
    let project = Arc::new(project);

    let mut node_ids: Vec<i64> = Vec::new();
    let mut tensor_names: HashSet<String> = HashSet::new();

    let mut total_nodes = 0;

    let mut batcher = project.batch_tensor_history_nodes(ThnData::tensordata().and_moodboard());

    while let Some(nodes) = batcher.next().await? {
        for node in nodes {
            total_nodes += 1;
            if !node.data().generated() {
                continue;
            }
            node_ids.push(node.rowid);
            if let Some(tensordata) = node.tensordata {
                for td in tensordata.into_iter() {
                    for tensor_name in td.tensor_names.iter() {
                        tensor_names.insert(tensor_name.clone());
                    }
                }
            }
        }
    }

    let all_tensors = project.list_tensors().await?;
    let all_tensor_names = HashSet::from_iter(
        all_tensors
            .iter()
            .map(|(_, tensor_name)| tensor_name.clone()),
    );
    let left_behind = all_tensor_names
        .difference(&tensor_names)
        .map(|tn| tn.clone())
        .collect::<Vec<_>>();

    println!("Take {} nodes out of {}", node_ids.len(), total_nodes);
    println!(
        "Take {} tensors out of {}",
        tensor_names.len(),
        all_tensors.len()
    );
    println!("Left behind: {:?}", left_behind);

    Ok(left_behind)
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

    async fn proc_tensors(&self) -> anyhow::Result<()> {
        let mut tasks: JoinSet<anyhow::Result<(String, String)>> = JoinSet::new();
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

                Ok((tensor_name, format!("tensors/{}", filename)))
            });
        }

        let mut count = 0;
        let mut tensor_files: Vec<(String, String)> = Vec::new();
        while let Some(result) = tasks.join_next().await {
            match result {
                Ok(result) => {
                    tensor_files.push(result?);
                }
                Err(e) => {
                    log::error!("Failed to process tensor: {:?}", e);
                }
            }

            count += 1;
            if count % 20 == 0 {
                log::info!("Processed {} tensors of {}", count, total);
            }
        }

        for batch in tensor_files.chunks(100) {
            let values = batch
                .into_iter()
                .map(|(tensor_name, path)| {
                    let data = path.as_bytes().to_vec();
                    (tensor_name.clone(), data)
                })
                .collect::<Vec<_>>();

            self.project.set_tensor_data(values).await?;

            // TODO: Insert into database
        }

        log::info!("Processed {} tensors of {}", count, total);
        Ok(())
    }
}
