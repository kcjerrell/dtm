use std::sync::{
    Arc, Mutex,
};

use candle_core::Tensor;
use entity::enums::EmbeddingType;
use tokio::task::JoinHandle;
use tokio::sync::mpsc::{Sender, Receiver};

use crate::{
    dtp_service::EmbeddingService,
    projects_db::{dtos::tensor::TensorRaw, DtResourceHandle},
    Tensor as DtmTensor,
};

impl EmbeddingService {
    pub async fn process_images(self, images: Vec<(i64, DtResourceHandle)>) -> anyhow::Result<()> {
        let num_threads = 4;

        let (cpu_tx, cpu_rx) = tokio::sync::mpsc::channel::<Option<CPUWorkItem>>(4);
        let cpu_rx_mutex = Arc::new(Mutex::new(cpu_rx));

        let (out_tx, mut out_rx) = tokio::sync::mpsc::channel::<Option<CPUWorkResult>>(4);

        let mut cpu_task_handles = Vec::new();
        for i in 0..num_threads {
            let cpu_rx_mutex_clone = cpu_rx_mutex.clone();
            let out_tx_clone = out_tx.clone();
            let self_clone = self.clone();

            let handle = tokio::task::spawn_blocking(move || {
                self_clone.cpu_worker(i, cpu_rx_mutex_clone, out_tx_clone)
            });
            cpu_task_handles.push(handle);
        }

        let batch_size = 16;
        let (model_id, model) = self.get_model()?;
        let pdb = self.dtp.get_db().await?;
        let out_task: JoinHandle<anyhow::Result<()>> = tokio::spawn(async move {
            let mut active_producers = num_threads;
            while active_producers > 0 {
                let mut batch = Vec::<CPUWorkResult>::with_capacity(batch_size);
                loop {
                    let item = out_rx.recv().await;
                    if let Some(item) = item.flatten() {
                        batch.push(item);
                        if batch.len() >= batch_size {
                            // Process batch
                            break;
                        }
                    } else {
                        active_producers -= 1;
                        if active_producers == 0 {
                            break;
                        }
                    }
                }
                if !batch.is_empty() {
                    let mut image_ids = Vec::with_capacity(batch.len());
                    let mut tensors = Vec::with_capacity(batch.len());
                    for b in batch.into_iter() {
                        image_ids.push(b.image_id);
                        tensors.push(b.resized_224);
                    }
                    let batch_tensor = Tensor::cat(&tensors, 0)?;
                    let embeddings = model.get_image_features(&batch_tensor)?;
                    println!("inserting embeddings...");
                    pdb.embeddings()
                        .insert_many(image_ids, embeddings, EmbeddingType::Image, model_id)
                        .await?;
                    println!("Processed batch")
                }
            }
            Ok(())
        });

        for (image_id, resource) in images {
            let tensor_raw = resource.get_tensor_raw().await?;
            if tensor_raw.is_none() {
                continue;
            }
            _ = cpu_tx.send(Some(CPUWorkItem {
                image_id,
                tensor_raw: tensor_raw.unwrap(),
            })).await;
        }

        for _ in 0..num_threads {
            _ = cpu_tx.send(None).await;
        }

        out_task.await??;

        Ok(())
    }

    fn cpu_worker(
        &self,
        worker_id: i64,
        rx_mutex: Arc<Mutex<Receiver<Option<CPUWorkItem>>>>,
        tx_out: Sender<Option<CPUWorkResult>>,
    ) -> anyhow::Result<()> {
        println!("Starting CPU worker {}", worker_id);
        loop {
            let item = {
                let mut rx = rx_mutex.lock().unwrap();
                rx.blocking_recv()
            };

            if let Some(item) = item.flatten() {
                // decompress data
                // create and resize tensor
                let tensor: DtmTensor = item.tensor_raw.try_into()?;
                let resized = self.preprocess_tensor(tensor)?;
                _ = tx_out.blocking_send(Some(CPUWorkResult {
                    image_id: item.image_id,
                    resized_224: resized,
                }));
                println!("CPU Worker {} processed item {}", worker_id, item.image_id);
            } else {
                tx_out.blocking_send(None)?;
                println!("CPU Worker {} finished", worker_id);
                break;
            }
        }
        Ok(())
    }
}

struct CPUWorkItem {
    image_id: i64,
    tensor_raw: TensorRaw,
}

struct CPUWorkResult {
    image_id: i64,
    resized_224: Tensor,
}
