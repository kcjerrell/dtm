use std::{ops::Div, sync::Arc};

use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::siglip::{Config, Model as SiglipModel};

use crate::{
    dtp_service::embeddings::{task::l2_normalize_batch, ModelSpec},
    projects_db::{dtos::embedding_model::EmbeddingModel, ProjectsDb},
};

use super::task::EmbeddingGenerator;

pub struct Siglip {
    model_entry: EmbeddingModel,
    model: Arc<SiglipModel>,
    device: Device,
}

impl Siglip {
    pub async fn new(device: Device) -> anyhow::Result<Self> {
        if !Self::check().await {
            anyhow::bail!("Siglip model not downloaded");
        }
        let model_entry = Self::get_model_entry().await?;

        let spec = Self::get_spec()?;
        let config_path = spec.config_path();
        let weights_path = spec.weights_path();

        println!("loading config: {}", config_path.display());
        let cfg: Config = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
        println!("cfg loaded, {:#?}", cfg);
        let vb =
            unsafe { VarBuilder::from_mmaped_safetensors(&[weights_path], DType::F32, &device)? };

        let model = SiglipModel::new(&cfg, vb)?;
        println!("model loaded");

        Ok(Self {
            model_entry,
            model: Arc::new(model),
            device,
        })
    }

    pub fn model_id(&self) -> i64 {
        self.model_entry.id
    }

    pub fn device(&self) -> &Device {
        &self.device
    }

    async fn get_model_entry() -> anyhow::Result<EmbeddingModel> {
        let pdb = ProjectsDb::get().await?;
        if let Some(model) = pdb
            .embedding_models()
            .get("google/siglip-base-patch16-224")
            .await?
        {
            return Ok(model);
        } else {
            let model = pdb
                .embedding_models()
                .create(
                    "google/siglip-base-patch16-224".to_string(),
                    "siglip".to_string(),
                    768,
                    "I dunno".to_string(),
                    None,
                )
                .await?;
            return Ok(model);
        }
    }

    pub async fn check() -> bool {
        Self::get_spec().map_or(false, |s| s.check())
    }

    pub async fn check_or_download() -> anyhow::Result<()> {
        let spec = Self::get_spec()?;
        spec.check_or_download().await?;
        Ok(())
    }

    pub fn get_spec() -> anyhow::Result<ModelSpec> {
        ModelSpec::new(
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
        )
    }
}

impl EmbeddingGenerator for Siglip {
    fn get_embeddings(&self, data: &[Tensor]) -> anyhow::Result<Tensor> {
        // input is (HWC)
        let batch_tensor = Tensor::stack(data, 0)?
            // BHWC
            .permute((0, 3, 1, 2))?
            // .to_dtype(DType::F32)?
            .div(255.0)?;

        let features = self.model.get_image_features(&batch_tensor)?;
        let normalized = l2_normalize_batch(&features)?;
        Ok(normalized)
    }
}
