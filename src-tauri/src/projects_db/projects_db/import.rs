use crate::projects_db::{
    dtos::image::ListImagesOptions, dtos::tensor::TensorHistoryImport, search::process_prompt,
    DTProject,
};
use entity::{
    enums::{ModelType, Sampler},
    images,
};
use sea_orm::{sea_query::OnConflict, ConnectionTrait, EntityTrait, Set};
use std::collections::HashMap;

use super::models::ModelTypeAndFile;
use super::{MixedError, ProjectsDb};

const SCAN_BATCH_SIZE: u32 = 500;

pub struct NodeModelWeight {
    pub node_id: i64,
    pub model_id: i64,
    pub weight: f32,
}

impl ProjectsDb {
    pub async fn scan_project(&self, id: i64, full_scan: bool) -> Result<(i64, u64), MixedError> {
        let project = self.get_project(id).await?;

        if project.excluded {
            return Ok((project.id, 0));
        }

        let dt_project = DTProject::get(&project.full_path).await?;
        let dt_project_info = dt_project.get_info().await?;
        let end = dt_project_info.history_max_id;

        let start = match full_scan {
            true => 0,
            false => project.last_id.or(Some(-1)).unwrap(),
        };

        for batch_start in (start..end).step_by(SCAN_BATCH_SIZE as usize) {
            let histories = dt_project
                .get_histories(batch_start, SCAN_BATCH_SIZE as usize)
                .await?;

            let histories_filtered: Vec<TensorHistoryImport> = histories
                .into_iter()
                .filter(|h| full_scan || (h.index_in_a_clip == 0 && h.generated))
                .collect();

            let preview_thumbs = HashMap::new();

            let models_lookup = self.process_models(&histories_filtered).await?;

            let (images, batch_image_loras, batch_image_controls) = self.prepare_image_data(
                project.id,
                &histories_filtered,
                &models_lookup,
                preview_thumbs,
            );

            let inserted_images = if !images.is_empty() {
                images::Entity::insert_many(images)
                    .on_conflict(
                        OnConflict::columns(vec![
                            images::Column::NodeId,
                            images::Column::ProjectId,
                        ])
                        .do_nothing()
                        .to_owned(),
                    )
                    .exec_with_returning(&self.db)
                    .await?
            } else {
                vec![]
            };

            let mut node_id_to_image_id: HashMap<i64, i64> = HashMap::new();
            for img in inserted_images {
                node_id_to_image_id.insert(img.node_id, img.id);
            }

            self.insert_related_data(
                &node_id_to_image_id,
                batch_image_loras,
                batch_image_controls,
            )
            .await?;
        }

        let total = self
            .list_images(ListImagesOptions {
                project_ids: Some([project.id].to_vec()),
                take: Some(0),
                ..Default::default()
            })
            .await?;

        self.rebuild_images_fts().await?;

        match total.images {
            Some(_) => Ok((project.id, total.total)),
            None => Err(MixedError::Other(
                "Unexpected result: list_images returned no images".to_string(),
            )),
        }
    }

    pub fn prepare_image_data(
        &self,
        project_id: i64,
        histories: &[TensorHistoryImport],
        models_lookup: &HashMap<ModelTypeAndFile, i64>,
        preview_thumbs: HashMap<i64, Vec<u8>>,
    ) -> (
        Vec<images::ActiveModel>,
        Vec<NodeModelWeight>,
        Vec<NodeModelWeight>,
    ) {
        let mut batch_image_loras: Vec<NodeModelWeight> = Vec::new();
        let mut batch_image_controls: Vec<NodeModelWeight> = Vec::new();

        let images_models: Vec<images::ActiveModel> = histories
            .iter()
            .map(|h: &TensorHistoryImport| {
                let preview_thumb = preview_thumbs.get(&h.preview_id).cloned();
                let mut image = images::ActiveModel {
                    project_id: Set(project_id),
                    node_id: Set(h.row_id),
                    preview_id: Set(h.preview_id),
                    thumbnail_half: Set(preview_thumb),
                    clip_id: Set(h.clip_id),
                    num_frames: Set(h.num_frames.map(|n| n as i16)),
                    prompt: Set(h.prompt.trim().to_string()),
                    negative_prompt: Set(h.negative_prompt.trim().to_string()),
                    prompt_search: Set(process_prompt(&h.prompt)),
                    negative_prompt_search: Set(process_prompt(&h.negative_prompt)),
                    refiner_start: Set(Some(h.refiner_start)),
                    start_width: Set(h.width as i16),
                    start_height: Set(h.height as i16),
                    seed: Set(h.seed as i64),
                    strength: Set(h.strength),
                    steps: Set(h.steps as i16),
                    guidance_scale: Set(h.guidance_scale),
                    shift: Set(h.shift),
                    hires_fix: Set(h.hires_fix),
                    tiled_decoding: Set(h.tiled_decoding),
                    tiled_diffusion: Set(h.tiled_diffusion),
                    tea_cache: Set(h.tea_cache),
                    cfg_zero_star: Set(h.cfg_zero_star),
                    upscaler_scale_factor: Set(h.upscaler.as_ref().map(|_| {
                        if h.upscaler_scale_factor == 2 {
                            2
                        } else {
                            4
                        }
                    })),
                    wall_clock: Set(h.wall_clock.unwrap_or_default().and_utc()),
                    has_mask: Set(h.has_mask),
                    has_depth: Set(h.has_depth),
                    has_pose: Set(h.has_pose),
                    has_color: Set(h.has_color),
                    has_custom: Set(h.has_custom),
                    has_scribble: Set(h.has_scribble),
                    has_shuffle: Set(h.has_shuffle),
                    sampler: Set(h.sampler),
                    ..Default::default()
                };

                for lora in &h.loras {
                    if let Some(id) = models_lookup.get(&(lora.model.clone(), ModelType::Lora)) {
                        batch_image_loras.push(NodeModelWeight {
                            node_id: h.row_id,
                            model_id: *id,
                            weight: lora.weight,
                        });
                    }
                }

                for control in &h.controls {
                    if let Some(id) = models_lookup.get(&(control.model.clone(), ModelType::Cnet)) {
                        batch_image_controls.push(NodeModelWeight {
                            node_id: h.row_id,
                            model_id: *id,
                            weight: control.weight,
                        });
                    }
                }

                if let Some(model_id) = models_lookup.get(&(h.model.clone(), ModelType::Model)) {
                    image.model_id = Set(Some(*model_id));
                }

                if let Some(refiner) = &h.refiner_model {
                    if let Some(refiner_id) =
                        models_lookup.get(&(refiner.clone(), ModelType::Model))
                    {
                        image.refiner_id = Set(Some(*refiner_id));
                    }
                }

                if let Some(upscaler) = &h.upscaler {
                    if let Some(upscaler_id) =
                        models_lookup.get(&(upscaler.clone(), ModelType::Upscaler))
                    {
                        image.upscaler_id = Set(Some(*upscaler_id));
                    }
                }

                image
            })
            .collect();

        (images_models, batch_image_loras, batch_image_controls)
    }

    pub async fn insert_related_data(
        &self,
        node_id_to_image_id: &HashMap<i64, i64>,
        batch_image_loras: Vec<NodeModelWeight>,
        batch_image_controls: Vec<NodeModelWeight>,
    ) -> Result<(), MixedError> {
        let mut lora_models: Vec<entity::image_loras::ActiveModel> = Vec::new();
        for lora in batch_image_loras {
            if let Some(image_id) = node_id_to_image_id.get(&lora.node_id) {
                lora_models.push(entity::image_loras::ActiveModel {
                    image_id: Set(*image_id),
                    lora_id: Set(lora.model_id),
                    weight: Set(lora.weight),
                    ..Default::default()
                });
            }
        }

        if !lora_models.is_empty() {
            entity::image_loras::Entity::insert_many(lora_models)
                .on_conflict(
                    OnConflict::columns([
                        entity::image_loras::Column::ImageId,
                        entity::image_loras::Column::LoraId,
                    ])
                    .do_nothing()
                    .to_owned(),
                )
                .exec(&self.db)
                .await?;
        }

        let mut control_models: Vec<entity::image_controls::ActiveModel> = Vec::new();
        for control in batch_image_controls {
            if let Some(image_id) = node_id_to_image_id.get(&control.node_id) {
                control_models.push(entity::image_controls::ActiveModel {
                    image_id: Set(*image_id),
                    control_id: Set(control.model_id),
                    weight: Set(control.weight),
                    ..Default::default()
                });
            }
        }

        if !control_models.is_empty() {
            entity::image_controls::Entity::insert_many(control_models)
                .on_conflict(
                    OnConflict::columns([
                        entity::image_controls::Column::ImageId,
                        entity::image_controls::Column::ControlId,
                    ])
                    .do_nothing()
                    .to_owned(),
                )
                .exec(&self.db)
                .await?;
        }

        Ok(())
    }

    pub async fn rebuild_images_fts(&self) -> Result<(), MixedError> {
        self.db
            .execute_unprepared("INSERT INTO images_fts(images_fts) VALUES('rebuild')")
            .await?;

        Ok(())
    }
}
