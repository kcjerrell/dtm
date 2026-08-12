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
        while let Some(mut item) = collect_rx.recv().await {
            updater.update(1);
            if item.result.is_err() {
                item.data = None;
                item.preview = None;
                errored_copies.push(item);
            }
        }
        Ok(errored_copies)
    });

    let resources = primary.into_iter().chain(extra);
    for resource in resources {
        input_tx.send(resource).await?;
    }

    drop(input_tx);

    for handle in handles {
        let res = handle.await;
        if let Err(err) = res {
            eprintln!("Error in archive copy: {err}");
        }
    }
    let errored_copies = collect.await??;

    eprintln!(
        "The following items could not be copied: {:?}",
        errored_copies
            .into_iter()
            .map(|it| format!("{}: {:?}", it.name, it.result.err()))
            .collect::<Vec<String>>()
    );

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

            while let Some(mut item) = rx.recv().await {
                let permit = semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|e| anyhow::anyhow!("Semaphore acquisition failed: {}", e))?;
                let tx = tx.clone();
                let project_ref = project_ref.clone();
                tasks.spawn(async move {
                    let _permit = permit;

                    if item.result.is_ok() {
                        item.result = item.convert(project_ref, lossless).await;
                    }

                    match tx.send(item).await {
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("ConvertWorker failed to send: {}", e);
                            return Err(e.into());
                        }
                    }

                    Ok(())
                });
            }
            tasks.join_all().await;
            drop(tx);
            println!("Convert dropped tx");
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
                while let Some(mut item) = rx.blocking_recv() {
                    if item.result.is_ok() {
                        item.result = item.archive(&mut writer);
                    }

                    if let Err(e) = tx.blocking_send(item) {
                        eprintln!("ZipWorker failed to send to db: {}", e);
                        return Err(e.into());
                    }
                }
                Ok::<(), anyhow::Error>(())
            })();

            writer.finish()?;
            drop(tx);
            println!("zip dropped tx");
            result
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
            let result = async move {
                while let Some(mut item) = rx.recv().await {
                    if item.result.is_ok() {
                        item.result = item.update_db(self_clone.db_conn.clone()).await;
                    }

                    match tx.send(item).await {
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("DbWorker failed to send: {}", e);
                            return Err(e.into());
                        }
                    }
                }
                drop(tx);
                println!("db dropped tx");
                Ok::<(), anyhow::Error>(())
            }
            .await;

            result
        });

        Ok(task)
    }
}

// async fn create_zip_worker(
//     archive_path: &PathBuf,
//     project_name: String,
//     db_path: PathBuf,
//     mut dest_conn: sqlx::pool::PoolConnection<sqlx::Sqlite>,
// ) -> Result<(Sender<CopyTensorItem>, JoinHandle<Result<String>>)> {
//     let zip_path = archive_path.join(format!("{}.zip", project_name));

//     let (zip_tx, mut zip_rx) = tokio::sync::mpsc::channel::<CopyTensorItem>(16);

//     let task_handle = tokio::task::spawn_blocking(move || {
//         let (db_tx, mut db_rx) = tokio::sync::mpsc::channel::<CopyTensorItem>(16);

//         let mut writer = StreamingZipWriter::new(zip_path.clone())?;
//         while let Some(entry) = zip_rx.blocking_recv() {}

//         // Wait for db_task to complete before reading the database file
//         drop(db_tx);
//         _ = tokio::runtime::Handle::current().block_on(async move {
//             _ = db_task.await;
//         });

//         // Add the SQLite database file to the archive
//         if let Ok(db_data) = std::fs::read(&db_path) {
//             if writer.start_entry("project.sqlite3").is_ok() {
//                 match writer.write_data(&db_data) {
//                     Ok(_) => println!("wrote into zip project.sqlite3"),
//                     Err(e) => println!("Failed to write db zip data: {}", e),
//                 }
//             } else {
//                 println!("Failed to start db zip entry");
//             }
//         } else {
//             println!("Failed to read database file: {}", db_path.display());
//         }

//         match writer.finish() {
//             Ok(_) => {}
//             Err(e) => println!("Failed to finish zip: {}", e),
//         }
//         Ok::<String, anyhow::Error>(zip_path.to_string_lossy().to_string())
//     });

//     Ok((zip_tx, task_handle))
// }

// pub fn create_db_worker() -> JoinHandle<Result<()>> {
//     let db_task: JoinHandle<Result<()>> =
//         tokio::spawn(async move {
//             while let Some(entry) = db_rx.recv().await {
//                 if let Err(e) = sqlx::query(
//                     "INSERT INTO main.tensors ( name, type, format, datatype, dim, data )
//             SELECT name, type, format, datatype, dim, ?1 AS data
//             FROM dtp.tensors WHERE name == ?2",
//                 )
//                 .bind(&entry.filename().as_bytes())
//                 .bind(&entry.name)
//                 .execute(&mut *dest_conn)
//                 .await
//                 {
//                     println!("Failed to insert tensor: {}", e);
//                     continue;
//                 }

//                 if let Some(preview_id) = entry.preview_id {
//                     if let Some(node_id) = entry.node_id {
//                         if let Err(e) = sqlx::query(
//                     "INSERT INTO thumbnailhistorynode (rowid, __pk0, p) VALUES (?1, ?2, ?3);
//                     INSERT INTO thumbnailhistoryhalfnode (rowid, __pk0, p) VALUES (?1, ?2, ?3);")
//                     .bind(node_id).bind(preview_id).bind(&entry.filename().as_bytes())
//                     .execute(&mut *dest_conn)
//                     .await {
//                             println!("Failed to insert thumbnail: {}", e);
//                         }
//                     }
//                 }
//             }
//             if let Err(e) = dest_conn.close().await {
//                 println!("Failed to close db connection: {}", e);
//             }
//             Ok(())
//         });
//     db_task
// }
