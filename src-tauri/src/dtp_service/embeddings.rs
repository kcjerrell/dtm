use anyhow::{anyhow, Result};
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::siglip::{Config, Model as SiglipModel};
use hf_hub::HFClient;
use std::{fs, path::PathBuf, sync::Arc};
use tokio::{sync::Semaphore, task::JoinHandle};

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    Tensor as DtmTensor
};

pub struct EmbeddingService {
    model: Option<SiglipModel>,
    spec: ModelSpec,
    device: Device,
    dtp: DTPService,
}

impl EmbeddingService {
    pub fn new(dtp: DTPService) -> Result<Self> {
        let spec = ModelSpec::new(
            "google".to_string(),
            "siglip-base-patch16-224".to_string(),
            vec![
                "README.md".to_string(),
                "config.json".to_string(),
                "model.safetensors".to_string(),
                "preprocessor_config.json".to_string(),
                "special_tokens_map.json".to_string(),
                "spiece.model".to_string(),
                "tokenizer.json".to_string(),
                "tokenizer_config.json".to_string(),
            ],
        )?;
        let device = Device::metal_if_available(0)?;
        Ok(EmbeddingService {
            model: None,
            spec,
            device: device,
            dtp,
        })
    }

    pub async fn init(&mut self) -> Result<()> {
        println!("prepping embedding service...");
        self.spec.check_or_download().await?;
        println!("embedding model files present...");

        let models = self.dtp.get_db().await?.embedding_models().list().await?;
        if !models
            .iter()
            .any(|m| m.name == "google/siglip-base-patch16-224")
        {
            println!("embedding model not found, adding it...");
            self.dtp
                .get_db()
                .await?
                .embedding_models()
                .create(
                    "google/siglip-base-patch16-224".to_string(),
                    "siglip".to_string(),
                    768,
                    "I dunno".to_string(),
                    None,
                )
                .await?;
        }

        let config_path = self.spec.config_path();
        let weights_path = self.spec.weights_path();

        println!("loading config: {}", config_path.display());
        let cfg: Config = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
        println!("cfg loaded, {:#?}", cfg);
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path], DType::F32, &self.device)?
        };

        let model = SiglipModel::new(&cfg, vb)?;
        println!("model loaded");

        self.model = Some(model);
        println!("embedding model loaded");
        Ok(())
    }

    pub fn create_embeddings(&self, tensors: Vec<DtmTensor>) -> Result<Tensor> {
        let model = self
            .model
            .as_ref()
            .ok_or(anyhow!("Embedding model not initialized"))?;

        let prepped = tensors
            .into_iter()
            .map(|t| self.preprocess_tensor(t))
            .collect::<Result<Vec<_>>>()?;

        let batch = Tensor::cat(&prepped, 0)?;

        let output = model.get_image_features(&batch)?;

        Ok(output)
    }

    pub fn preprocess_tensor(&self, tensor: DtmTensor) -> Result<Tensor> {
        let out = tensor.as_f32().ok_or(anyhow!("Tensor has no data"))?;

        let width = tensor.width as usize;
        let height = tensor.height as usize;
        let channels = tensor.channels as usize;
        let target_size = 224;

        // Calculate center crop
        let crop_size = width.min(height);
        let start_x = (width - crop_size) / 2;
        let start_y = (height - crop_size) / 2;

        // Calculate sampling step
        let step = crop_size as f32 / target_size as f32;

        let mut resized = Vec::with_capacity(target_size * target_size * channels);

        for y in 0..target_size {
            let fy = start_y as f32 + (y as f32 + 0.5) * step - 0.5;
            for x in 0..target_size {
                let fx = start_x as f32 + (x as f32 + 0.5) * step - 0.5;
                for c in 0..channels {
                    let v = get_pixel(&out, fx, fy, width, height, c, channels);
                    resized.push(v);
                }
            }
        }

        let hwc = Tensor::from_vec(resized, (224, 224, 3), &self.device)?;
        let chw = hwc.permute((2, 0, 1))?.unsqueeze(0)?;
        Ok(chw)
    }
}

#[inline]
fn get_pixel(img: &[f32], x: f32, y: f32, w: usize, h: usize, c: usize, channels: usize) -> f32 {
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);

    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);

    let dx = x - x0 as f32;
    let dy = y - y0 as f32;

    let idx = |xx: usize, yy: usize| -> usize { (yy * w + xx) * channels + c };

    let p00 = img[idx(x0, y0)];
    let p10 = img[idx(x1, y0)];
    let p01 = img[idx(x0, y1)];
    let p11 = img[idx(x1, y1)];

    let top = p00 * (1.0 - dx) + p10 * dx;
    let bottom = p01 * (1.0 - dx) + p11 * dx;

    top * (1.0 - dy) + bottom * dy
}

pub fn helperr<T>(result: std::result::Result<T, String>) -> anyhow::Result<T> {
    result.map_err(|e| anyhow::anyhow!(e))
}

pub struct ModelSpec {
    pub name: String,
    pub owner: String,
    pub files: Vec<String>,
    pub folder: PathBuf,
}

impl ModelSpec {
    pub fn new(owner: String, name: String, files: Vec<String>) -> Result<Self> {
        let folder =
            AppHandleWrapper::get_app_data_dir_static()?.join(format!("models/{}/{}", owner, name));
        Ok(Self {
            name,
            owner,
            files,
            folder,
        })
    }

    pub fn config_path(&self) -> PathBuf {
        self.folder.join("config.json")
    }

    pub fn weights_path(&self) -> PathBuf {
        self.folder.join("model.safetensors")
    }

    pub async fn check_or_download(&self) -> Result<()> {
        if !self.check() {
            self.download().await?;
        }
        Ok(())
    }

    pub fn check(&self) -> bool {
        for file in self.files.iter() {
            let file_path = self.folder.join(file);
            if !file_path.try_exists().unwrap_or(false) {
                return false;
            }
        }

        true
    }

    pub async fn download(&self) -> Result<()> {
        let client = HFClient::new()?;
        let repo = client.model(&self.owner, &self.name);

        let temp_dir = self.folder.join("temp");

        fs::create_dir_all(&temp_dir)?;

        let semaphore = Arc::new(Semaphore::new(2));
        let mut handles = Vec::with_capacity(self.files.len());

        for filename in self.files.iter() {
            let permit = semaphore.clone().acquire_owned().await?;

            let repo = repo.clone();
            let temp_dir = temp_dir.clone();
            let filename = filename.clone();

            let folder = self.folder.clone();

            let handle: JoinHandle<Result<()>> = tokio::spawn(async move {
                let _permit = permit;

                let dest_path = folder.join(&filename);
                if dest_path.exists() {
                    return Ok(());
                }

                let path = repo
                    .download_file()
                    .filename(filename)
                    .local_dir(&temp_dir)
                    .send()
                    .await?;

                fs::rename(path, &dest_path)?;

                println!("Downloaded to: {}", dest_path.display());

                Ok(())
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.await??;
        }

        fs::remove_dir_all(&temp_dir)?;

        Ok(())
    }
}

pub struct EmbeddingProcessor {

}

/*
some kind of streaming pipeline?

I like the idea of creating n workers and having them keep processing items until None
vs creating 100 tasks that have semaphore.

can do it with a channel if the receiver is wrapped in a mutex.

but there's got to be a faster way than 

*/