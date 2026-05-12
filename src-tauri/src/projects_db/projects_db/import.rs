use crate::projects_db::{
    dt_project::{TensorHistoryNode, ThnData, ThnFilter},
    dtos::image::ListImagesOptions,
    search::process_prompt,
    DTProject,
};
use entity::{
    enums::{ModelType, Sampler},
    images,
};
use sea_orm::{sea_query::OnConflict, ConnectionTrait, EntityTrait, Set};
use std::collections::{HashMap, HashSet};

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

        let dt_project = DTProject::open(&project.full_path).await?;
        let dt_project_info = dt_project.get_info().await?;
        let end = dt_project_info.history_max_id;

        let start = match full_scan {
            true => 0,
            false => project.last_id.or(Some(-1)).unwrap(),
        };

        for batch_start in (start..end).step_by(SCAN_BATCH_SIZE as usize) {
            let histories = dt_project
                .get_tensor_history_nodes(
                    Some(ThnFilter::Range(
                        batch_start,
                        batch_start + SCAN_BATCH_SIZE as i64,
                    )),
                    Some(ThnData::tensordata().and_legacy_prompts().and_clip()),
                )
                .await?;

            let histories_filtered: Vec<TensorHistoryNode> = histories
                .into_iter()
                .filter(|h| {
                    let fb = h.data();
                    full_scan || (fb.index_in_a_clip() == 0 && fb.generated())
                })
                .collect();

            // currently unused, but allows for storing previews in the db
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

    // prepares entities for insert into db
    pub fn prepare_image_data(
        &self,
        project_id: i64,
        histories: &[TensorHistoryNode],
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
            .map(|h: &TensorHistoryNode| {
                let fb = h.data();
                let preview_id = fb.preview_id();
                let clip_id = fb.clip_id();

                // currently unused
                let preview_thumb = preview_thumbs.get(&preview_id).cloned();

                let mut has_mask = false;
                let mut has_depth = false;
                let mut has_pose = false;
                let mut has_color = false;
                let mut has_custom = false;
                let mut has_scribble = false;
                let mut has_shuffle = false;

                if let Some(tds) = &h.tensordata {
                    for td in tds {
                        let tdfb = td.data();
                        if tdfb.mask_id() != 0 {
                            has_mask = true;
                        }
                        if tdfb.depth_map_id() != 0 {
                            has_depth = true;
                        }
                        if tdfb.pose_id() != 0 {
                            has_pose = true;
                        }
                        if tdfb.color_palette_id() != 0 {
                            has_color = true;
                        }
                        if tdfb.custom_id() != 0 {
                            has_custom = true;
                        }
                        if tdfb.scribble_id() != 0 {
                            has_scribble = true;
                        }
                    }
                } else {
                    if fb.mask_id() != 0 {
                        has_mask = true;
                    }
                    if fb.depth_map_id() != 0 {
                        has_depth = true;
                    }
                    if fb.pose_id() != 0 {
                        has_pose = true;
                    }
                    if fb.color_palette_id() != 0 {
                        has_color = true;
                    }
                    if fb.custom_id() != 0 {
                        has_custom = true;
                    }
                    if fb.scribble_id() != 0 {
                        has_scribble = true;
                    }
                }

                if h.moodboard.as_ref().is_some_and(|mb| mb.len() > 0) {
                    has_shuffle = true;
                }

                let prompt = h.prompt().unwrap_or("").trim();
                let negative_prompt = h.negative_prompt().unwrap_or("").trim();

                let mut image = images::ActiveModel {
                    project_id: Set(project_id),
                    node_id: Set(h.rowid),
                    preview_id: Set(preview_id),
                    thumbnail_half: Set(preview_thumb),
                    clip_id: Set(clip_id),
                    num_frames: Set(h.clip.as_ref().map(|c| c.count as i16)),
                    prompt: Set(prompt.to_string()),
                    negative_prompt: Set(negative_prompt.to_string()),
                    prompt_search: Set(process_prompt(prompt)),
                    negative_prompt_search: Set(process_prompt(negative_prompt)),
                    refiner_start: Set(Some(fb.refiner_start())),
                    start_width: Set(fb.start_width() as i16),
                    start_height: Set(fb.start_height() as i16),
                    seed: Set(fb.seed() as i64),
                    strength: Set(fb.strength()),
                    steps: Set(fb.steps() as i16),
                    guidance_scale: Set(fb.guidance_scale()),
                    shift: Set(fb.shift()),
                    hires_fix: Set(fb.hires_fix()),
                    tiled_decoding: Set(fb.tiled_decoding()),
                    tiled_diffusion: Set(fb.tiled_diffusion()),
                    tea_cache: Set(fb.tea_cache()),
                    cfg_zero_star: Set(fb.cfg_zero_star()),
                    upscaler_scale_factor: Set(fb.upscaler().map(|_| {
                        if fb.upscaler_scale_factor() == 2 {
                            2
                        } else {
                            4
                        }
                    })),
                    wall_clock: Set({
                        let wc = fb.wall_clock();
                        chrono::DateTime::from_timestamp(
                            wc / 1_000_000,
                            (wc % 1_000_000) as u32 * 1000,
                        )
                        .unwrap_or_default()
                        .into()
                    }),
                    has_mask: Set(has_mask),
                    has_depth: Set(has_depth),
                    has_pose: Set(has_pose),
                    has_color: Set(has_color),
                    has_custom: Set(has_custom),
                    has_scribble: Set(has_scribble),
                    has_shuffle: Set(has_shuffle),
                    sampler: Set(fb.sampler().0),
                    ..Default::default()
                };

                for lora in fb.loras().unwrap_or_default() {
                    if let Some(model) = lora.file() {
                        if let Some(id) = models_lookup.get(&(model.to_string(), ModelType::Lora)) {
                            batch_image_loras.push(NodeModelWeight {
                                node_id: h.rowid,
                                model_id: *id,
                                weight: lora.weight(),
                            });
                        }
                    }
                }

                for control in fb.controls().unwrap_or_default() {
                    if let Some(model) = control.file() {
                        if let Some(id) = models_lookup.get(&(model.to_string(), ModelType::Cnet)) {
                            batch_image_controls.push(NodeModelWeight {
                                node_id: h.rowid,
                                model_id: *id,
                                weight: control.weight(),
                            });
                        }
                    }
                }

                if let Some(model) = fb.model() {
                    if let Some(model_id) =
                        models_lookup.get(&(model.to_string(), ModelType::Model))
                    {
                        image.model_id = Set(Some(*model_id));
                    }
                }

                if let Some(refiner) = fb.refiner_model() {
                    if let Some(refiner_id) =
                        models_lookup.get(&(refiner.to_string(), ModelType::Model))
                    {
                        image.refiner_id = Set(Some(*refiner_id));
                    }
                }

                if let Some(upscaler) = fb.upscaler() {
                    if let Some(upscaler_id) =
                        models_lookup.get(&(upscaler.to_string(), ModelType::Upscaler))
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
