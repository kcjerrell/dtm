use std::collections::{HashMap, HashSet};

use crate::projects_db::dt_project::TensorHistoryNode;
use crate::projects_db::dtos::model::ModelExtra;
use entity::{enums::ModelType, image_controls, image_loras, images, models};
use sea_orm::{sea_query::OnConflict, ColumnTrait, EntityTrait, QueryFilter, QuerySelect, Set};
use serde::Deserialize;

use super::{MixedError, ProjectsDb};

#[derive(Deserialize)]
pub struct ModelInfoImport {
    pub file: String,
    pub name: String,
    pub version: String,
    #[serde(default = "default_true")]
    pub is_new: bool,
}

fn default_true() -> bool {
    true
}

pub type ModelTypeAndFile = (String, ModelType);

impl ProjectsDb {
    pub async fn process_models(
        &self,
        histories: &[TensorHistoryNode],
    ) -> Result<HashMap<ModelTypeAndFile, i64>, MixedError> {
        let models: Vec<models::ActiveModel> = HashSet::<ModelTypeAndFile>::from_iter(
            histories
                .iter()
                .flat_map(get_all_models_from_tensor_history),
        )
        .iter()
        .map(|m| models::ActiveModel {
            filename: Set(m.0.clone()),
            model_type: Set(m.1),
            ..Default::default()
        })
        .collect();

        let models = models::Entity::insert_many(models)
            .on_conflict(
                OnConflict::columns([models::Column::Filename, models::Column::ModelType])
                    .update_column(models::Column::Filename)
                    .to_owned(),
            )
            .exec_with_returning(&self.db)
            .await?;

        let mut models_lookup: HashMap<ModelTypeAndFile, i64> = HashMap::new();
        for model in models {
            models_lookup.insert((model.filename.clone(), model.model_type), model.id);
        }
        Ok(models_lookup)
    }

    pub async fn update_models(
        &self,
        mut models: HashMap<String, ModelInfoImport>,
        model_type: ModelType,
    ) -> Result<usize, MixedError> {
        if models.is_empty() {
            return Ok(0);
        }

        let existing_models = models::Entity::find()
            .filter(models::Column::ModelType.eq(model_type))
            .all(&self.db)
            .await?;

        for model in existing_models {
            if let Some(import_model) = models.get_mut(&model.filename) {
                if model.name.unwrap_or_default() == import_model.name
                    && model.version.unwrap_or_default() == import_model.version
                {
                    import_model.is_new = false;
                }
            }
        }

        let active_models: Vec<models::ActiveModel> = models
            .into_values()
            .filter_map(|m| match m.is_new {
                true => Some(models::ActiveModel {
                    filename: Set(m.file.clone()),
                    name: Set(Some(m.name.clone())),
                    version: Set(Some(m.version.clone())),
                    model_type: Set(model_type),
                    ..Default::default()
                }),
                false => None,
            })
            .collect();

        let count = active_models.len();

        models::Entity::insert_many(active_models)
            .on_conflict(
                OnConflict::columns([models::Column::Filename, models::Column::ModelType])
                    .update_columns([models::Column::Name, models::Column::Version])
                    .to_owned(),
            )
            .exec(&self.db)
            .await?;

        Ok(count)
    }

    pub async fn scan_model_info(
        &self,
        path: &str,
        model_type: ModelType,
    ) -> Result<usize, MixedError> {
        let file = std::fs::File::open(path)?;
        let reader = std::io::BufReader::new(file);
        let models_list: Vec<ModelInfoImport> =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        let kvs = models_list.into_iter().map(|m| (m.file.clone(), m));

        let models_map: HashMap<String, ModelInfoImport> = HashMap::from_iter(kvs);

        let count = self.update_models(models_map, model_type).await?;

        Ok(count)
    }

    pub async fn list_models(
        &self,
        model_type: Option<ModelType>,
    ) -> Result<Vec<ModelExtra>, MixedError> {
        let mut models_query = models::Entity::find();

        if let Some(t) = model_type {
            models_query = models_query.filter(models::Column::ModelType.eq(t));
        }

        let models = models_query.all(&self.db).await?;

        if models.is_empty() {
            return Ok(Vec::new());
        }

        let mut counts: HashMap<i64, i64> = HashMap::new();

        // Model + Refiner usage (images)
        {
            let rows = images::Entity::find()
                .select_only()
                .column(images::Column::ModelId)
                .column_as(images::Column::Id.count(), "cnt")
                .filter(images::Column::ModelId.is_not_null())
                .group_by(images::Column::ModelId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }

            let rows = images::Entity::find()
                .select_only()
                .column(images::Column::RefinerId)
                .column_as(images::Column::Id.count(), "cnt")
                .filter(images::Column::RefinerId.is_not_null())
                .group_by(images::Column::RefinerId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // Lora usage
        {
            let rows = image_loras::Entity::find()
                .select_only()
                .column(image_loras::Column::LoraId)
                .column_as(image_loras::Column::ImageId.count(), "cnt")
                .group_by(image_loras::Column::LoraId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // ControlNet usage
        {
            let rows = image_controls::Entity::find()
                .select_only()
                .column(image_controls::Column::ControlId)
                .column_as(image_controls::Column::ImageId.count(), "cnt")
                .group_by(image_controls::Column::ControlId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // Upscaler usage
        {
            let rows = images::Entity::find()
                .select_only()
                .column(images::Column::UpscalerId)
                .column_as(images::Column::Id.count(), "cnt")
                .filter(images::Column::UpscalerId.is_not_null())
                .group_by(images::Column::UpscalerId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        let mut results = Vec::new();
        for model in models {
            let count = counts.get(&model.id).copied().unwrap_or(0);
            if count > 0 {
                results.push(ModelExtra {
                    id: model.id,
                    model_type: model.model_type,
                    filename: model.filename,
                    name: model.name,
                    version: model.version,
                    count,
                });
            }
        }

        results.sort_by(|a, b| b.count.cmp(&a.count));
        Ok(results)
    }
}

pub fn get_all_models_from_tensor_history(h: &TensorHistoryNode) -> Vec<ModelTypeAndFile> {
    let mut all_image_models: Vec<ModelTypeAndFile> = Vec::new();
    let fb = h.data();
    if let Some(model) = fb.model() {
        all_image_models.push((model.to_string(), ModelType::Model));
    }
    if let Some(refiner) = fb.refiner_model() {
        all_image_models.push((refiner.to_string(), ModelType::Model));
    }
    if let Some(upscaler) = fb.upscaler() {
        all_image_models.push((upscaler.to_string(), ModelType::Upscaler));
    }
    if let Some(loras) = fb.loras() {
        for i in 0..loras.len() {
            let lora = loras.get(i);
            if let Some(model) = lora.file() {
                all_image_models.push((model.to_string(), ModelType::Lora));
            }
        }
    }
    if let Some(controls) = fb.controls() {
        for i in 0..controls.len() {
            let control = controls.get(i);
            if let Some(model) = control.file() {
                all_image_models.push((model.to_string(), ModelType::Cnet));
            }
        }
    }
    all_image_models
}
