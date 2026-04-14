use crate::dtp_service::{events::DTPEvent, jobs::{Job, JobContext, JobResult}};
use entity::enums::ModelType;
use serde_json::Value;
use std::sync::Arc;
use reqwest;

pub struct ModelInfoFile {
    pub path: String,
    pub model_type: ModelType,
}

impl From<(String, ModelType)> for ModelInfoFile {
    fn from(value: (String, ModelType)) -> Self {
        Self {
            path: value.0,
            model_type: value.1,
        }
    }
}

pub struct SyncModelsJob {
    pub model_info: Vec<ModelInfoFile>,
}

impl SyncModelsJob {
    pub fn new(model_info: Vec<ModelInfoFile>) -> Self {
        Self { model_info }
    }
}

#[async_trait::async_trait]
impl Job for SyncModelsJob {
    fn get_label(&self) -> String {
        format!("SyncModelsJob")
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let pdb = ctx.dtp.get_db().await.unwrap();
        for model_info in self.model_info.iter() {
            pdb.scan_model_info(&model_info.path, model_info.model_type).await.unwrap();
        };
        Ok(JobResult::Event(DTPEvent::ModelsChanged))
    }
}

pub struct FetchModels;

#[async_trait::async_trait]
impl Job for FetchModels {
    fn get_label(&self) -> String {
        format!("FetchModels")
    }

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        let app_data_dir = ctx.app_handle.get_app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

        let url = "https://kcjerrell.github.io/dt-models/combined_models.json";
        let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
        let json: Value = response.json().await.map_err(|e| e.to_string())?;

        let mut model_files = Vec::new();

        if let Some(obj) = json.as_object() {
            for (key, value) in obj {
                if key == "lastUpdate" {
                    continue;
                }

                if let Some(arr) = value.as_array() {
                    let file_path = app_data_dir.join(format!("{}.json", key));
                    let file_content = serde_json::to_string_pretty(arr).map_err(|e| e.to_string())?;
                    std::fs::write(&file_path, file_content).map_err(|e| e.to_string())?;

                    let model_type = match key.as_str() {
                        "officialModels" | "communityModels" | "uncuratedModels" => ModelType::Model,
                        "officialLoras" | "communityLoras" => ModelType::Lora,
                        "officialCnets" | "communityCnets" => ModelType::Cnet,
                        _ => ModelType::None,
                    };

                    model_files.push(ModelInfoFile {
                        path: file_path.to_string_lossy().to_string(),
                        model_type,
                    });
                }
            }
        }

        Ok(JobResult::Subtasks(vec![Arc::new(SyncModelsJob::new(
            model_files,
        ))]))
    }
}
