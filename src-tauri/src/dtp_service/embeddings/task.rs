use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use candle_core::{Device, IndexOp, Tensor};
use entity::enums::EmbeddingType;
use image::imageops::FilterType;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::task::JoinHandle;

use crate::dtp_service::embeddings::siglip::Siglip;
use crate::projects_db::decompress_fzip;
use crate::projects_db::dtos::tensor::TensorRaw;
use crate::util::update_gate::UpdateGate;
use crate::ResourceHandle;
use crate::Tensor as DtmTensor;
use crate::{dtp_service::EmbeddingService, projects_db::DtResourceHandle};

impl EmbeddingService {
    pub async fn process_images(self, images: Vec<(i64, DtResourceHandle)>) -> anyhow::Result<()> {
        let num_threads = 7;

        let channels = create_channels();

        let format = TargetFormat {
            width: 244,
            height: 244,
            channels: 3,
        };

        // let model = Siglip::new(Device::Cpu).await?;
        let model = Siglip::new(Device::metal_if_available(0)?).await?;
        let model_id = model.model_id();
        let device = model.device().clone();

        let mut cpu_task_handles = Vec::new();
        for i in 0..num_threads {
            let cpu_rx_mutex_clone = channels.data_rx.clone();
            let out_tx_clone = channels.tensor_tx.clone();
            let self_clone = self.clone();
            let device_clone = device.clone();

            let handle = tokio::task::spawn_blocking(move || {
                self_clone.tensor_worker(
                    i,
                    &format,
                    &device_clone,
                    cpu_rx_mutex_clone,
                    out_tx_clone,
                )
            });
            cpu_task_handles.push(handle);
        }

        let batch_size = 16;
        let tensor_rx = channels.tensor_rx;
        let self_clone = self.clone();

        let embedding_task = tokio::task::spawn_blocking(move || {
            self_clone.embedding_worker(
                model,
                batch_size,
                num_threads,
                tensor_rx,
                channels.embed_tx,
            )
        });

        let pdb = self.dtp.get_db().await?;
        let mut embed_rx = channels.embed_rx;
        let mut gate = UpdateGate::new(images.len(), 10);
        let out_task: JoinHandle<anyhow::Result<()>> = tokio::spawn(async move {
            while let Some(batch) = embed_rx.recv().await.flatten() {
                let count = batch.metadata.len();
                pdb.embeddings()
                    .insert_many(
                        batch.metadata,
                        batch.embedding,
                        EmbeddingType::Image,
                        model_id,
                    )
                    .await?;
                if gate.update(count) {
                    println!(
                        "Processed {} of {} images ({})",
                        gate.current,
                        gate.total,
                        gate.prog()
                    );
                }
            }

            Ok(())
        });

        println!("Processing {} images", images.len());
        for (image_id, resource) in images {
            if let Some(image) = resource.get_preview(false).await? {
                if let Err(e) = channels
                    .data_tx
                    .send(Some(LoadedDataMsg {
                        metadata: image_id,
                        data: Box::new(ImageBytes(image)),
                    }))
                    .await
                {
                    eprintln!("Failed to send image {} to CPU worker: {}", image_id, e);
                }
            }
        }

        for _ in 0..num_threads {
            _ = channels.data_tx.send(None).await;
        }

        _ = embedding_task.await;

        out_task.await??;

        Ok(())
    }

    /// synchronous loop that converts images into tensors of specific size
    /// receives LoadedDataMsg and sends ProcessedTensorMsg
    /// must be run on separate thread! (spawn_blocking)
    fn tensor_worker<T>(
        &self,
        worker_id: i64,
        format: &TargetFormat,
        device: &Device,
        rx: DataRx<T>,
        tx: TensorTx<T>,
    ) -> anyhow::Result<()>
    where
        T: Send,
    {
        println!("Starting CPU worker {}", worker_id);
        let (width, height, channels) = format.whc();

        let mut waiting = Duration::ZERO;
        let mut processing = Duration::ZERO;
        let mut blocked = Duration::ZERO;
        let mut items_processed = 0;

        loop {
            let waiting_start = Instant::now();
            let item = {
                let mut rx = rx.lock().unwrap();
                rx.blocking_recv()
            };
            waiting += waiting_start.elapsed();

            if let Some(item) = item.flatten() {
                let processing_start = Instant::now();
                let result = item.data.into_tensor(width, height, channels, device);
                processing += processing_start.elapsed();
                items_processed += 1;

                match result {
                    Err(e) => {
                        log::warn!(
                            "CPU Worker {} could not process item: {}",
                            worker_id,
                            e.to_string()
                        );
                    }
                    Ok(tensor) => {
                        let blocked_start = Instant::now();
                        _ = tx.blocking_send(Some(ProcessedTensorMsg {
                            metadata: item.metadata,
                            tensor,
                        }));
                        blocked += blocked_start.elapsed();
                    }
                }
            } else {
                tx.blocking_send(None).ok();
                println!(
                    "CPU Worker {} finished. Waiting: {:.1}ms, Processing: {:.1}ms, Blocking: {:.1}ms (per item)",
                    worker_id,
                    waiting.as_millis() as f64 / items_processed as f64,
                    processing.as_millis() as f64 / items_processed as f64,
                    blocked.as_millis() as f64 / items_processed as f64
                );
                break;
            }
        }
        Ok(())
    }

    fn embedding_worker<M, T>(
        &self,
        model: M,
        batch_size: usize,
        producers_count: i64,
        mut rx: TensorRx<T>,
        tx: EmbeddingTx<T>,
    ) -> anyhow::Result<()>
    where
        T: Send,
        M: Send + EmbeddingGenerator,
    {
        let mut waiting = Duration::ZERO;
        let mut processing = Duration::ZERO;
        let mut blocked = Duration::ZERO;
        let mut items_processed = 0;

        let mut active_producers = producers_count;
        while active_producers > 0 {
            let mut batch_data: Vec<T> = Vec::with_capacity(batch_size);
            let mut batch_tensors: Vec<Tensor> = Vec::with_capacity(batch_size);
            while batch_data.len() < batch_size {
                let waiting_start = Instant::now();
                let item = rx.blocking_recv().flatten();
                waiting += waiting_start.elapsed();

                match item {
                    Some(item) => {
                        batch_data.push(item.metadata);
                        batch_tensors.push(item.tensor);
                        items_processed += 1;
                    }
                    None => {
                        active_producers -= 1;
                        if active_producers == 0 {
                            break;
                        }
                    }
                }
            }
            if !batch_data.is_empty() {
                let processing_start = Instant::now();
                let embedding = model.get_embeddings(batch_tensors.as_slice());
                processing += processing_start.elapsed();

                match embedding {
                    Err(e) => {
                        log::warn!("Failed to process embedding: {}", e);
                        continue;
                    }
                    Ok(embedding) => {
                        let blocked_start = Instant::now();
                        _ = tx.blocking_send(Some(EmbeddingMsg {
                            metadata: batch_data,
                            embedding,
                        }));
                        blocked += blocked_start.elapsed();
                    }
                }
            }
        }
        _ = tx.blocking_send(None);
        println!(
            "Embedding Worker finished. Waiting: {:.1}ms, Processing: {:.1}ms, Blocked: {:.1}ms (per item)",
            waiting.as_millis() as f64 / items_processed as f64,
            processing.as_millis() as f64 / items_processed as f64,
            blocked.as_millis() as f64 / items_processed as f64
        );

        Ok(())
    }
}

pub trait EmbeddingGenerator: Send {
    fn get_embeddings(&self, data: &[Tensor]) -> anyhow::Result<Tensor>;
}

/// Produced by the 1st stage of the embedding pipeline
/// Contains the image or image data to be processed
pub struct LoadedDataMsg<T>
where
    T: Send,
{
    metadata: T,
    data: Box<dyn IntoTensor + Send>,
}

/// Produced by the 2nd stage of the embedding pipeline
/// Contains the resized and preprocessed tensor ready to be used
pub struct ProcessedTensorMsg<T>
where
    T: Send,
{
    metadata: T,
    tensor: Tensor,
}

/// Produced by the 3rd stage of the embedding pipeline
/// Contains the generated embeddings for a batch of images
pub struct EmbeddingMsg<T>
where
    T: Send,
{
    metadata: Vec<T>,
    embedding: Tensor,
}

#[derive(Debug, Copy, Clone)]
pub struct TargetFormat {
    width: usize,
    height: usize,
    channels: usize,
}

impl TargetFormat {
    fn whc(&self) -> (usize, usize, usize) {
        (self.width, self.height, self.channels)
    }
}

pub trait IntoTensor: Send {
    fn into_tensor(
        self: Box<Self>,
        width: usize,
        height: usize,
        channels: usize,
        device: &Device,
    ) -> anyhow::Result<Tensor>;
}

/// represents an encoded image (jpg, png, etc) as a byte array that can be opend with the image crate
pub struct ImageBytes(Vec<u8>);

impl ImageBytes {
    pub fn as_slice(&self) -> &[u8] {
        &self.0
    }
}
impl IntoTensor for ImageBytes {
    fn into_tensor(
        self: Box<Self>,
        width: usize,
        height: usize,
        channels: usize,
        device: &Device,
    ) -> anyhow::Result<Tensor> {
        if channels != 3 {
            anyhow::bail!(
                "IntoTensor for ImageBytes: unsupported number of channels: {}",
                channels
            );
        }

        let mut img =
            image::load_from_memory_with_format(self.as_slice(), image::ImageFormat::Jpeg)
                .map_err(|e| anyhow::anyhow!("Failed to load image from memory: {}", e))?;

        let w = img.width() as usize;
        let h = img.height() as usize;

        // let resized = img.resize_exact(width, height, FilterType::CatmullRom);

        // source is wider than target, crop width
        if w * height > width * h {
            let new_w = (h * width / height) as usize;
            let x = ((w - new_w) / 2) as usize;
            img = img.crop(x as u32, 0, new_w as u32, h as u32);
        }
        // source is taller than target, crop height
        else if w * height < width * h {
            let new_h = (w * height / width) as usize;
            let y = (h - new_h) / 2 as usize;
            img = img.crop(0, y as u32, w as u32, new_h as u32);
        }

        let pixels = img
            .resize_exact(
                width as u32,
                height as u32,
                image::imageops::FilterType::Triangle,
            )
            .to_rgb32f()
            .into_raw();
        // .to_rgb8()
        // .into_raw();

        let t = Tensor::from_slice(&pixels, (height, width, 3), device)?;
        // let scaled = t
        //     .permute((2, 0, 1))?
        //     .unsqueeze(0)?
        //     .to_dtype(candle_core::DType::F32)?
        //     .affine(1.0 / 255.0, 0.0)?;

        Ok(t)
    }
}
// impl IntoTensor for TensorRaw {
//     fn into_tensor(
//         self: Box<Self>,
//         width: usize,
//         height: usize,
//         channels: usize,
//         device: &Device,
//     ) -> anyhow::Result<Tensor> {
//         let raw: DtmTensor = self.try_into()?;

//         let t = Tensor::from_vec(
//             self.data,
//             (width as usize, height as usize, channels as usize),
//             device,
//         )?;
//         Ok(t)
//     }
// }

type DataTx<T> = Sender<Option<LoadedDataMsg<T>>>;
type DataRx<T> = Arc<Mutex<Receiver<Option<LoadedDataMsg<T>>>>>;
type TensorTx<T> = Sender<Option<ProcessedTensorMsg<T>>>;
type TensorRx<T> = Receiver<Option<ProcessedTensorMsg<T>>>;
type EmbeddingTx<T> = Sender<Option<EmbeddingMsg<T>>>;
type EmbeddingRx<T> = Receiver<Option<EmbeddingMsg<T>>>;

struct PipelineChannels<T>
where
    T: Send,
{
    data_tx: DataTx<T>,
    data_rx: DataRx<T>,
    tensor_tx: TensorTx<T>,
    tensor_rx: TensorRx<T>,
    embed_tx: EmbeddingTx<T>,
    embed_rx: EmbeddingRx<T>,
}

fn create_channels() -> PipelineChannels<i64> {
    let (data_tx, data_rx) = tokio::sync::mpsc::channel::<Option<LoadedDataMsg<i64>>>(16);
    let data_rx_mutex = Arc::new(Mutex::new(data_rx));

    let (tensor_tx, tensor_rx) = tokio::sync::mpsc::channel::<Option<ProcessedTensorMsg<i64>>>(16);

    let (embed_tx, embed_rx) = tokio::sync::mpsc::channel::<Option<EmbeddingMsg<i64>>>(32);

    PipelineChannels {
        data_tx,
        data_rx: data_rx_mutex,
        tensor_tx,
        tensor_rx,
        embed_tx,
        embed_rx,
    }
}

pub fn l2_normalize_batch(t: &Tensor) -> anyhow::Result<Tensor> {
    // t: [batch, dim]
    let squared = t.sqr()?; // [batch, dim]
    let sum = squared.sum(1)?; // [batch]
    let norms = sum.sqrt()?; // [batch]

    // reshape to [batch, 1] so broadcast_div can expand it
    let norms = norms.unsqueeze(1)?; // [batch, 1]

    let normalized = t.broadcast_div(&norms)?;

    Ok(normalized)
}
