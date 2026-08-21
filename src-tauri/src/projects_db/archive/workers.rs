use std::{path::PathBuf, sync::Arc};

use s_zip::StreamingZipWriter;

use tokio::{
    sync::{
        mpsc::{Receiver, Sender},
        Mutex, Semaphore,
    },
    task::{JoinHandle, JoinSet},
};

use crate::{
    projects_db::{archive::copy_tensor_item::CopyTensorItem, DtProjectRef},
    util::update_gate::PrintUpdate,
};

use anyhow::Result;

pub async fn copy_tensors(
    primary: Vec<CopyTensorItem>,
    extra: Vec<CopyTensorItem>,
    project_ref: &DtProjectRef,
    archive_path: PathBuf,
    db_conn: sqlx::pool::PoolConnection<sqlx::Sqlite>,
    lossless: bool,
) -> Result<()> {
    let convert = ConvertWorker::new(project_ref.clone(), 7, lossless);
    let zip = ZipWorker::new(archive_path.clone());
    let db = DbWorker::new(db_conn);

    log::debug!("Created workers: ConvertWorker, ZipWorker, DbWorker");

    let stages: Vec<Box<dyn Worker<Item = CopyTensorItem> + Send + Sync>> =
        vec![Box::new(convert), Box::new(zip), Box::new(db)];

    let (input_tx, input_rx) = tokio::sync::mpsc::channel::<CopyTensorItem>(8);
    let mut next_rx = Some(input_rx);
    let mut handles: Vec<JoinHandle<Result<()>>> = Vec::new();

    for stage in stages.iter() {
        let (output_tx, output_rx) = tokio::sync::mpsc::channel::<CopyTensorItem>(8);
        let handle = stage.start(next_rx.take().unwrap(), output_tx).await?;
        handles.push(handle);
        next_rx = Some(output_rx);
    }

    let updater = PrintUpdate::new(primary.len() + extra.len(), 20, "Processed", "items");
    let mut collect_rx = next_rx.unwrap();
    let collect: JoinHandle<Result<Vec<CopyTensorItem>>> = tokio::spawn(async move {
        let mut errored_copies: Vec<CopyTensorItem> = Vec::new();
        let mut items_collected = 0;
        while let Some(mut item) = collect_rx.recv().await {
            items_collected += 1;
            updater.update(1);
            if item.result.is_err() {
                log::warn!(
                    "Collector: item {} failed with error: {:?}",
                    item.name,
                    item.result
                );
                item.data = None;
                item.preview = None;
                errored_copies.push(item);
            } else {
                log::trace!("Collector: item {} succeeded", item.name);
            }
        }
        log::debug!(
            "Collector: finished collecting {} items ({} errored)",
            items_collected,
            errored_copies.len()
        );
        Ok(errored_copies)
    });

    let resources = primary.into_iter().chain(extra);
    let mut items_sent = 0;
    for resource in resources {
        items_sent += 1;
        log::trace!(
            "Sending item {} to pipeline (total sent: {})",
            resource.name,
            items_sent
        );
        input_tx.send(resource).await?;
    }

    log::debug!(
        "All {} items sent to pipeline, dropping input_tx",
        items_sent
    );
    drop(input_tx);

    for handle in handles {
        let res = handle.await;
        if let Err(err) = res {
            log::error!("Error in archive copy: {err}");
        }
    }

    log::debug!("All worker handles completed, waiting for collector");
    let errored_copies = collect.await??;

    if !errored_copies.is_empty() {
        log::warn!(
            "The following items could not be copied: {:?}",
            errored_copies
                .into_iter()
                .map(|it| format!("{}: {:?}", it.name, it.result.err()))
                .collect::<Vec<String>>()
        );
    }

    Ok(())
}

#[async_trait::async_trait]
pub trait Worker {
    type Item: Send + Sync + 'static;
    async fn start(
        &self,
        rx: Receiver<Self::Item>,
        tx: Sender<Self::Item>,
    ) -> Result<JoinHandle<Result<()>>>;
}

#[derive(Debug, Clone)]
struct ConvertWorker {
    project_ref: DtProjectRef,
    concurrency: usize,
    lossless: bool,
}

impl ConvertWorker {
    pub fn new(project_ref: DtProjectRef, concurrency: usize, lossless: bool) -> Self {
        Self {
            project_ref,
            concurrency,
            lossless,
        }
    }
}

#[async_trait::async_trait]
impl Worker for ConvertWorker {
    type Item = CopyTensorItem;

    async fn start(
        &self,
        mut rx: Receiver<Self::Item>,
        tx: Sender<Self::Item>,
    ) -> Result<JoinHandle<Result<()>>> {
        let project_ref = self.project_ref.clone();
        let concurrency = self.concurrency;
        let lossless = self.lossless;
        let handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(concurrency));
            let mut tasks: JoinSet<Result<()>> = JoinSet::new();
            let mut items_processed = 0;

            while let Some(mut item) = rx.recv().await {
                items_processed += 1;
                let permit = semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|e| anyhow::anyhow!("Semaphore acquisition failed: {}", e))?;
                let tx = tx.clone();
                let project_ref = project_ref.clone();
                let item_name = item.name.clone();
                tasks.spawn(async move {
                    let _permit = permit;

                    if item.result.is_ok() {
                        item.result = item.convert(project_ref, lossless).await;
                        if let Err(ref e) = item.result {
                            log::warn!(
                                "ConvertWorker: failed to convert item {}: {}",
                                item_name,
                                e
                            );
                        }
                    } else {
                        log::debug!(
                            "ConvertWorker: skipping item {} due to prior error",
                            item_name
                        );
                    }

                    match tx.send(item).await {
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("ConvertWorker failed to send: {}", e);
                            return Err(e.into());
                        }
                    }

                    Ok(())
                });
            }
            tasks.join_all().await;
            drop(tx);
            log::debug!("Convert dropped tx (processed {} items)", items_processed);
            Ok(())
        });

        Ok(handle)
    }
}

struct ZipWorker {
    archive_path: PathBuf,
}

impl ZipWorker {
    pub fn new(archive_path: PathBuf) -> Self {
        Self { archive_path }
    }
}

#[async_trait::async_trait]
impl Worker for ZipWorker {
    type Item = CopyTensorItem;

    async fn start(
        &self,
        mut rx: Receiver<Self::Item>,
        tx: Sender<Self::Item>,
    ) -> Result<JoinHandle<Result<()>>> {
        let archive_path = self.archive_path.clone();
        let task = tokio::task::spawn_blocking(move || {
            let mut writer = StreamingZipWriter::with_compression(archive_path, 0)?;

            // written as such so that writer can be closed even if
            let result = (|| {
                let mut items_processed = 0;
                while let Some(mut item) = rx.blocking_recv() {
                    items_processed += 1;
                    if item.result.is_ok() {
                        item.result = item.archive(&mut writer);
                        if let Err(ref e) = item.result {
                            log::warn!("ZipWorker: failed to archive item {}: {}", item.name, e);
                        }
                    } else {
                        log::debug!(
                            "ZipWorker: skipping item {} due to prior error ({} total)",
                            item.name,
                            items_processed
                        );
                    }

                    let item_name = item.name.to_string();
                    if let Err(e) = tx.blocking_send(item) {
                        log::error!("ZipWorker failed to send to db: {}", e);
                        return Err(e.into());
                    }
                }
                log::debug!("ZipWorker: finished processing {} items", items_processed);
                Ok::<usize, anyhow::Error>(items_processed)
            })();

            let items_processed = result?;
            writer.finish()?;
            drop(tx);
            log::debug!("ZipWorker dropped tx: processed {} items", items_processed);
            Ok(())
        });

        Ok(task)
    }
}

#[derive(Clone)]
struct DbWorker {
    db_conn: Arc<Mutex<sqlx::pool::PoolConnection<sqlx::Sqlite>>>,
}

impl DbWorker {
    pub fn new(db_conn: sqlx::pool::PoolConnection<sqlx::Sqlite>) -> Self {
        Self {
            db_conn: Arc::new(Mutex::new(db_conn)),
        }
    }
}

#[async_trait::async_trait]
impl Worker for DbWorker {
    type Item = CopyTensorItem;

    async fn start(
        &self,
        mut rx: Receiver<Self::Item>,
        tx: Sender<Self::Item>,
    ) -> Result<JoinHandle<Result<()>>> {
        let self_clone = self.clone();
        let task = tokio::task::spawn(async move {
            let mut items_added = 0;
            let mut items_processed = 0;
            let result = async move {
                while let Some(mut item) = rx.recv().await {
                    items_processed += 1;
                    if item.result.is_ok() {
                        item.result = item.update_db(self_clone.db_conn.clone()).await;
                        items_added += 1;
                    } else {
                        log::debug!(
                            "skipped db update for item {} (error: {:?}) (processed {} total)",
                            item.name,
                            item.result,
                            items_processed
                        );
                    }

                    match tx.send(item).await {
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("DbWorker failed to send: {}", e);
                            return Err(e.into());
                        }
                    }
                }
                drop(tx);
                log::debug!(
                    "db dropped tx (processed {} items total, {} added to db)",
                    items_processed,
                    items_added
                );
                Ok::<(), anyhow::Error>(())
            }
            .await;

            log::debug!("DbWorker: finished with result: {:?}", result);
            result
        });

        Ok(task)
    }
}