use anyhow::Result;
use hf_hub::HFClient;
use std::{fs, path::PathBuf, sync::Arc};
use tokio::{sync::Semaphore, task::JoinHandle};

use crate::dtp_service::{AppHandleWrapper, DTPService};

mod siglip;
pub mod task;
pub mod color;

#[derive(Clone)]
pub struct EmbeddingService {
    dtp: Arc<DTPService>,
}

impl EmbeddingService {
    pub fn new(dtp: DTPService) -> Result<Self> {
        Ok(Self { dtp: Arc::new(dtp) })
    }

    // pub fn create_text_embeddding(&self, text: String) -> Result<Vec<f32>> {
    //     let model = self
    //         .model
    //         .get()
    //         .ok_or(anyhow!("Embedding model not initialized"))?;
    //     let tokenizer = tokenizers::Tokenizer::from_file(self.spec.folder.join("tokenizer.json"))
    //         .map_err(|e| anyhow!(e.to_string()))?;
    //     let encoding = tokenizer
    //         .encode(text, false)
    //         .map_err(|e| anyhow!(e.to_string()))?;
    //     let input_ids = encoding.get_ids();
    //     // TODO: Convert input_ids to tensor and pass to model
    //     todo!()
    // }
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
