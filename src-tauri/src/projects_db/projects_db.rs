use entity::{
    enums::{ModelType, Sampler},
    images::{self},
    projects,
};
use migration::{Migrator, MigratorTrait};
use sea_orm::{
    sea_query::{Expr, OnConflict},
    ActiveModelTrait, ColumnTrait, ConnectionTrait, Database, DatabaseConnection, DbErr,
    EntityTrait, ExprTrait, FromQueryResult, JoinType, Order, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, QueryTrait, RelationTrait, Set,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::Manager;
use tokio::sync::OnceCell;

use crate::projects_db::{
    dt_project::{self, ProjectRef},
    filters::ListImagesFilter,
    search::{self, process_prompt},
    DTProject, TensorHistoryImport,
};

static CELL: OnceCell<ProjectsDb> = OnceCell::const_new();

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    pub db: DatabaseConnection,
}

fn get_path(app_handle: &tauri::AppHandle) -> String {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();
    let project_db_path = app_data_dir.join("projects2.db");
    format!("sqlite://{}?mode=rwc", project_db_path.to_str().unwrap())
}

impl ProjectsDb {
    pub async fn get_or_init(app_handle: &tauri::AppHandle) -> Result<&'static ProjectsDb, String> {
        CELL.get_or_try_init(|| async {
            ProjectsDb::new(&get_path(app_handle))
                .await
                .map_err(|e| e.to_string())
        })
        .await
    }

    pub fn get() -> Result<&'static ProjectsDb, String> {
        CELL.get().ok_or("Database not initialized".to_string())
    }

    async fn new(db_path: &str) -> Result<Self, DbErr> {
        let db = Database::connect(db_path).await?;
        Migrator::up(&db, None).await?;
        Ok(Self { db: db })
    }

    pub async fn get_image_count(&self) -> Result<u32, DbErr> {
        let count = images::Entity::find().count(&self.db).await?;
        Ok(count as u32)
    }

    pub async fn add_project(&self, path: &str) -> Result<ProjectExtra, MixedError> {
        let dt_project = DTProject::get(path).await?;
        let fingerprint = dt_project.get_fingerprint().await?;

        let project = projects::ActiveModel {
            path: Set(path.to_string()),
            fingerprint: Set(fingerprint),
            ..Default::default()
        };

        let project = entity::projects::Entity::insert(project)
            .on_conflict(
                OnConflict::column(entity::projects::Column::Path)
                    // do a fake update so the row returns
                    .value(entity::projects::Column::Path, path)
                    .to_owned(),
            )
            .exec_with_returning(&self.db)
            .await?;

        let project = self.get_project(project.id).await?;

        Ok(project)
    }

    pub async fn remove_project(&self, path: &str) -> Result<Option<i64>, DbErr> {
        let project = projects::Entity::find_by_path(path).one(&self.db).await?;

        if project.is_none() {
            println!("No project found for path: {}", path);
            return Ok(None);
        }
        let project = project.unwrap();

        let delete_result = projects::Entity::delete_by_id(project.id)
            .exec(&self.db)
            .await?;

        if delete_result.rows_affected == 0 {
            println!("project couldn't be deleted: {}", path);
        }

        Ok(Some(project.id))
    }

    pub async fn get_project(&self, id: i64) -> Result<ProjectExtra, DbErr> {
        use images::Entity as Images;
        use projects::Entity as Projects;

        let result = Projects::find_by_id(id)
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((Images, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(Expr::col((Images, images::Column::NodeId)).max(), "last_id")
            .into_model::<ProjectExtra>()
            .one(&self.db)
            .await?;

        Ok(result.unwrap())
    }

    pub async fn get_project_by_path(&self, path: &str) -> Result<ProjectExtra, DbErr> {
        use images::Entity as Images;
        use projects::Entity as Projects;

        let result = Projects::find_by_path(path)
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((Images, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(Expr::col((Images, images::Column::NodeId)).max(), "last_id")
            .into_model::<ProjectExtra>()
            .one(&self.db)
            .await?;

        match result {
            Some(result) => Ok(result),
            None => Err(DbErr::RecordNotFound(format!("Project {path} not found"))),
        }
    }

    /// List all projects, newest first
    pub async fn list_projects(&self) -> Result<Vec<ProjectExtra>, DbErr> {
        use images::Entity as Images;
        use projects::Entity as Projects;

        let results = Projects::find()
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((Images, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(Expr::col((Images, images::Column::Id)).max(), "last_id")
            .group_by(projects::Column::Id)
            .into_model::<ProjectExtra>()
            .all(&self.db)
            .await?;

        Ok(results)
    }

    pub async fn update_project(
        &self,
        path: &str,
        filesize: Option<i64>,
        modified: Option<i64>,
    ) -> Result<projects::Model, DbErr> {
        // Fetch existing project
        let mut project: projects::ActiveModel = projects::Entity::find()
            .filter(projects::Column::Path.eq(path))
            .one(&self.db)
            .await?
            .ok_or(DbErr::RecordNotFound(format!("Project {path} not found")))?
            .into();

        // Apply updates
        if let Some(v) = filesize {
            project.filesize = Set(Some(v));
        }

        if let Some(v) = modified {
            project.modified = Set(Some(v));
        }

        // Save changes
        let updated: projects::Model = project.update(&self.db).await?;

        Ok(updated)
    }

    pub async fn scan_project(
        &self,
        path: &str,
        full_scan: bool,
    ) -> Result<(i64, u64), MixedError> {
        let dt_project = DTProject::get(path).await?;
        let dt_project_info = dt_project.get_info().await?;
        let end = dt_project_info.history_max_id;
        let project = self.get_project_by_path(path).await?;

        let start = match full_scan {
            true => 0,
            false => project.last_id.or(Some(-1)).unwrap(),
        };

        for batch_start in (start..end).step_by(250) {
            let histories = dt_project.get_histories(batch_start, 250).await?;

            let histories_filtered: Vec<TensorHistoryImport> = histories
                .into_iter()
                .filter(|h| full_scan || (h.index_in_a_clip == 0 && h.generated))
                .collect();

            let _preview_ids = histories_filtered
                .iter()
                .map(|h| h.preview_id)
                .collect::<Vec<_>>();
            // let preview_thumbs: HashMap<i64, Vec<u8>> = match preview_ids.len() {
            //     0 => HashMap::new(),
            //     _ => dt_project.batch_thumbs(&preview_ids).await?,
            // };
            let preview_thumbs = HashMap::new();

            let models_lookup = self.process_models(&histories_filtered).await?;

            let (images, batch_image_loras, batch_image_controls) = self.prepare_image_data(
                project.id,
                &histories_filtered,
                &models_lookup,
                preview_thumbs,
            );

            let inserted_images = if !images.is_empty() {
                entity::images::Entity::insert_many(images)
                    .on_conflict(
                        OnConflict::columns(vec![
                            entity::images::Column::NodeId,
                            entity::images::Column::ProjectId,
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

            // on_progress((batch_start + 250) as i32, end as i32);
        }

        let total = self
            .list_images(ListImagesOptions {
                project_ids: Some([project.id].to_vec()),
                take: Some(0),
                ..Default::default()
            })
            .await?;

        self.rebuild_images_fts().await?;

        match total {
            ListImagesResult::Counts(_) => panic!("Unexpected result"),
            ListImagesResult::Images(images) => Ok((project.id, images.total)),
        }
    }

    async fn process_models(
        &self,
        histories: &[TensorHistoryImport],
    ) -> Result<HashMap<ModelTypeAndFile, i64>, DbErr> {
        let models: Vec<entity::models::ActiveModel> = HashSet::<ModelTypeAndFile>::from_iter(
            histories
                .iter()
                .flat_map(get_all_models_from_tensor_history),
        )
        .iter()
        .map(|m| entity::models::ActiveModel {
            filename: Set(m.0.clone()),
            model_type: Set(m.1),
            ..Default::default()
        })
        .collect();

        let models = entity::models::Entity::insert_many(models)
            .on_conflict(
                OnConflict::columns([
                    entity::models::Column::Filename,
                    entity::models::Column::ModelType,
                ])
                .update_column(entity::models::Column::Filename)
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

    fn prepare_image_data(
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

        let images: Vec<images::ActiveModel> = histories
            .iter()
            .map(|h: &TensorHistoryImport| {
                let preview_thumb = preview_thumbs.get(&h.preview_id).cloned();
                let mut image = images::ActiveModel {
                    project_id: Set(project_id),
                    node_id: Set(h.row_id),
                    preview_id: Set(h.preview_id),
                    thumbnail_half: Set(preview_thumb),
                    clip_id: Set(h.clip_id),
                    num_frames: Set(h.num_frames.and_then(|n| Some(n as i16))),
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
                    wall_clock: Set(h.wall_clock.unwrap_or_default().and_utc()), // Handle missing wall_clock
                    has_mask: Set(h.has_mask),
                    has_depth: Set(h.has_depth),
                    has_pose: Set(h.has_pose),
                    has_color: Set(h.has_color),
                    has_custom: Set(h.has_custom),
                    has_scribble: Set(h.has_scribble),
                    has_shuffle: Set(h.has_shuffle),
                    sampler: Set(Sampler::try_from(h.sampler).unwrap_or(Sampler::EulerA)), // Fallback instead of panic
                    ..Default::default()
                };

                if h.loras.len() > 0 {
                    let image_loras: Vec<NodeModelWeight> = h
                        .loras
                        .iter()
                        .filter_map(|l| {
                            models_lookup
                                .get(&(l.model.clone(), ModelType::Lora))
                                .map(|id| NodeModelWeight {
                                    node_id: h.row_id,
                                    model_id: *id,
                                    weight: l.weight,
                                })
                        })
                        .collect();
                    batch_image_loras.extend(image_loras);
                }

                if h.controls.len() > 0 {
                    let image_controls: Vec<NodeModelWeight> = h
                        .controls
                        .iter()
                        .filter_map(|c| {
                            models_lookup
                                .get(&(c.model.clone(), ModelType::Cnet))
                                .map(|id| NodeModelWeight {
                                    node_id: h.row_id,
                                    model_id: *id,
                                    weight: c.weight,
                                })
                        })
                        .collect();
                    batch_image_controls.extend(image_controls);
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

        (images, batch_image_loras, batch_image_controls)
    }

    async fn insert_related_data(
        &self,
        node_id_to_image_id: &HashMap<i64, i64>,
        batch_image_loras: Vec<NodeModelWeight>,
        batch_image_controls: Vec<NodeModelWeight>,
    ) -> Result<(), DbErr> {
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

    pub async fn list_images(&self, opts: ListImagesOptions) -> Result<ListImagesResult, DbErr> {
        // print!("ListImagesOptions: {:#?}\n", opts);

        let mut query = images::Entity::find()
            .join(JoinType::LeftJoin, images::Relation::Models.def())
            .column_as(entity::models::Column::Filename, "model_file")
            .order_by(images::Column::WallClock, Order::Desc);

        if let Some(project_ids) = &opts.project_ids {
            if !project_ids.is_empty() {
                query = query.filter(images::Column::ProjectId.is_in(project_ids.clone()));
            }
        }

        if let Some(search) = &opts.search {
            query = search::add_search(query, search);
        }
        // Join the FTS table
        // query = query.join(
        //     sea_orm::JoinType::InnerJoin,
        //     sea_orm::RelationDef {
        //         // FROM images
        //         from_tbl: sea_query::TableRef::Table(
        //             sea_query::TableName::from(images::Entity.into_iden()),
        //             None,
        //         ),
        //         from_col: sea_orm::Identity::Unary(sea_query::Alias::new("id").into_iden()),

        //         // TO images_fts
        //         to_tbl: sea_query::TableRef::Table(
        //             sea_query::TableName::from(sea_query::Alias::new("images_fts").into_iden()),
        //             None,
        //         ),
        //         to_col: sea_orm::Identity::Unary(sea_query::Alias::new("rowid").into_iden()),
        //         // this only matches equal column names, but we override using on_condition below
        //         rel_type: sea_orm::RelationType::HasOne,
        //         is_owner: false,
        //         skip_fk: false,
        //         on_delete: None,
        //         on_update: None,
        //         on_condition: Some(std::sync::Arc::new(|_l, _r| {
        //             sea_orm::Condition::all()
        //                 .add(sea_query::Expr::cust("images_fts.rowid = images.id"))
        //         })),
        //         fk_name: None,
        //         condition_type: sea_query::ConditionType::Any,
        //     },
        // );k

        // // MATCH query
        // query = query.filter(sea_query::Expr::cust_with_values(
        //     "images_fts MATCH ?",
        //     [sea_orm::Value::from(search.clone())],
        // ));
        //     let mut cond = Condition::any();
        //     for term in search.split_whitespace() {
        //         cond = cond.add(images::Column::Prompt.contains(term));
        //     }
        //     query = query.filter(cond);
        // }

        if let Some(filters) = opts.filters {
            for f in filters {
                query = f.target.apply(f.operator, &f.value, query);
            }
        }

        if Some(true) == opts.count {
            let project_counts = query
                .select_only()
                .column(images::Column::ProjectId)
                .column_as(images::Column::Id.count(), "count")
                .group_by(images::Column::ProjectId)
                .into_model::<ImageCount>()
                .all(&self.db)
                .await?;

            return Ok(ListImagesResult::Counts(
                project_counts
                    .into_iter()
                    .map(|p| ImageCount {
                        project_id: p.project_id,
                        count: p.count,
                    })
                    .collect(),
            ));
        }

        if let Some(skip) = opts.skip {
            query = query.offset(skip as u64);
        }

        if let Some(take) = opts.take {
            query = query.limit(take as u64);
        }

        let _stmt = query.clone().build(self.db.get_database_backend());
        // println!("Query: {:#?}", stmt);

        let count = query.clone().count(&self.db).await?;

        let result = query.into_model::<ImageExtra>().all(&self.db).await?;
        Ok(ListImagesResult::Images(Paged {
            items: result,
            total: count,
        }))
    }

    pub async fn list_watch_folders(&self) -> Result<Vec<entity::watch_folders::Model>, DbErr> {
        let folder = entity::watch_folders::Entity::find()
            .into_model()
            .all(&self.db)
            .await?;

        Ok(folder)
    }

    // pub async fn get_project_folder(
    //     &self,
    //     project_path: &str,
    // ) -> Result<entity::watch_folders::Model, DbErr> {
    //     let folders = self.list_watch_folders().await?;
    //     let project_folders = folders
    //         .into_iter()
    //         .filter(|f| f.item_type == entity::enums::ItemType::Projects)
    //         .collect();

    //     //finish this function
    //     todo!();
    //     // Ok(folder)
    // }

    pub async fn add_watch_folder(
        &self,
        path: &str,
        item_type: entity::enums::ItemType,
        recursive: bool,
    ) -> Result<entity::watch_folders::Model, DbErr> {
        let folder = entity::watch_folders::ActiveModel {
            path: Set(path.to_string()),
            item_type: Set(item_type),
            recursive: Set(Some(recursive)),
            ..Default::default()
        };
        let folder = entity::watch_folders::Entity::insert(folder)
            .on_conflict(
                OnConflict::columns([
                    entity::watch_folders::Column::Path,
                    entity::watch_folders::Column::ItemType,
                ])
                .value(entity::watch_folders::Column::Path, path)
                .to_owned(),
            )
            .exec_with_returning(&self.db)
            .await?;

        Ok(folder)
    }

    pub async fn remove_watch_folders(&self, ids: Vec<i64>) -> Result<(), DbErr> {
        if ids.is_empty() {
            return Ok(());
        }

        entity::watch_folders::Entity::delete_many()
            .filter(entity::watch_folders::Column::Id.is_in(ids))
            .exec(&self.db)
            .await?;

        Ok(())
    }

    pub async fn update_watch_folder(
        &self,
        id: i32,
        recursive: Option<bool>,
        last_updated: Option<i64>,
    ) -> Result<entity::watch_folders::Model, DbErr> {
        let folder = entity::watch_folders::Entity::find_by_id(id)
            .one(&self.db)
            .await?;
        let mut folder: entity::watch_folders::ActiveModel = folder.unwrap().into();
        if let Some(recursive) = recursive {
            folder.recursive = Set(Some(recursive));
        }
        if let Some(last_updated) = last_updated {
            folder.last_updated = Set(Some(last_updated));
        }

        let folder: entity::watch_folders::Model = folder.update(&self.db).await?;
        Ok(folder)
    }

    pub async fn update_exclude(&self, project_id: i32, exclude: bool) -> Result<(), DbErr> {
        let project = projects::Entity::find_by_id(project_id)
            .one(&self.db)
            .await?
            .ok_or(DbErr::RecordNotFound(format!(
                "Project {project_id} not found"
            )))?;

        let mut project: projects::ActiveModel = project.into();
        project.excluded = Set(exclude);
        project.modified = Set(None);
        project.filesize = Set(None);
        project.update(&self.db).await?;

        if exclude {
            println!("Excluding project {}", project_id);
            // Remove all images associated with this project
            // Cascade delete will handle image_controls and image_loras
            let result = images::Entity::delete_many()
                .filter(images::Column::ProjectId.eq(project_id))
                .exec(&self.db)
                .await?;
            println!("Deleted {} images", result.rows_affected);
        }

        Ok(())
    }

    pub async fn rebuild_images_fts(&self) -> Result<(), sea_orm::DbErr> {
        self.db
            .execute_unprepared("INSERT INTO images_fts(images_fts) VALUES('rebuild')")
            .await?;

        Ok(())
    }

    pub async fn get_dt_project(
        &self,
        project_ref: ProjectRef,
    ) -> Result<std::sync::Arc<dt_project::DTProject>, String> {
        let project_path = match project_ref {
            ProjectRef::Path(path) => path,
            ProjectRef::Id(id) => {
                let project = entity::projects::Entity::find_by_id(id as i32)
                    .one(&self.db)
                    .await
                    .map_err(|e| e.to_string())?
                    .unwrap();
                project.path
            }
        };
        Ok(dt_project::DTProject::get(&project_path).await.unwrap())
    }

    pub async fn get_clip(&self, image_id: i64) -> Result<Vec<TensorHistoryImport>, String> {
        let result: Option<(String, i64)> = images::Entity::find_by_id(image_id)
            .join(JoinType::InnerJoin, images::Relation::Projects.def())
            .select_only()
            .column(entity::projects::Column::Path)
            .column(images::Column::NodeId)
            .into_tuple()
            .one(&self.db)
            .await
            .map_err(|e| e.to_string())?;

        let (project_path, node_id) = result.ok_or("Image or Project not found")?;

        let dt_project = DTProject::get(&project_path)
            .await
            .map_err(|e| e.to_string())?;
        dt_project
            .get_histories_from_clip(node_id)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn update_models(
        &self,
        mut models: HashMap<String, ModelInfoImport>,
        model_type: ModelType,
    ) -> Result<usize, DbErr> {
        if models.is_empty() {
            return Ok(0);
        }

        let existing_models = entity::models::Entity::find()
            .filter(entity::models::Column::ModelType.eq(model_type))
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

        let active_models: Vec<entity::models::ActiveModel> = models
            .into_values()
            .filter_map(|m| match m.is_new {
                true => Some(entity::models::ActiveModel {
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

        entity::models::Entity::insert_many(active_models)
            .on_conflict(
                OnConflict::columns([
                    entity::models::Column::Filename,
                    entity::models::Column::ModelType,
                ])
                .update_columns([
                    entity::models::Column::Name,
                    entity::models::Column::Version,
                ])
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
        let models: Vec<ModelInfoImport> =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        let kvs = models.into_iter().map(|m| (m.file.clone(), m));

        let models: HashMap<String, ModelInfoImport> = HashMap::from_iter(kvs);

        let count = self.update_models(models, model_type).await?;

        Ok(count)
    }

    pub async fn list_models(
        &self,
        model_type: Option<ModelType>,
    ) -> Result<Vec<ModelExtra>, DbErr> {
        // 1. Load models (optionally filtered)
        let mut models_query = entity::models::Entity::find();

        if let Some(t) = model_type {
            models_query = models_query.filter(entity::models::Column::ModelType.eq(t));
        }

        let models = models_query.all(&self.db).await?;

        // Early exit
        if models.is_empty() {
            return Ok(Vec::new());
        }

        let mut counts: HashMap<i64, i64> = HashMap::new();

        // 2. Model + Refiner usage (images)
        {
            let rows = entity::images::Entity::find()
                .select_only()
                .column(entity::images::Column::ModelId)
                .column_as(entity::images::Column::Id.count(), "cnt")
                .filter(entity::images::Column::ModelId.is_not_null())
                .group_by(entity::images::Column::ModelId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }

            let rows = entity::images::Entity::find()
                .select_only()
                .column(entity::images::Column::RefinerId)
                .column_as(entity::images::Column::Id.count(), "cnt")
                .filter(entity::images::Column::RefinerId.is_not_null())
                .group_by(entity::images::Column::RefinerId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // 3. Lora usage
        {
            let rows = entity::image_loras::Entity::find()
                .select_only()
                .column(entity::image_loras::Column::LoraId)
                .column_as(entity::image_loras::Column::ImageId.count(), "cnt")
                .group_by(entity::image_loras::Column::LoraId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // 4. ControlNet usage
        {
            let rows = entity::image_controls::Entity::find()
                .select_only()
                .column(entity::image_controls::Column::ControlId)
                .column_as(entity::image_controls::Column::ImageId.count(), "cnt")
                .group_by(entity::image_controls::Column::ControlId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // 5. Upscaler usage
        {
            let rows = entity::images::Entity::find()
                .select_only()
                .column(entity::images::Column::UpscalerId)
                .column_as(entity::images::Column::Id.count(), "cnt")
                .filter(entity::images::Column::UpscalerId.is_not_null())
                .group_by(entity::images::Column::UpscalerId)
                .into_tuple::<(i64, i64)>()
                .all(&self.db)
                .await?;

            for (model_id, cnt) in rows {
                *counts.entry(model_id).or_default() += cnt;
            }
        }

        // 6. Build final result
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

        // 7. Sort by usage desc
        results.sort_by(|a, b| b.count.cmp(&a.count));

        Ok(results)
    }
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ImageCount {
    pub project_id: i64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub enum ListImagesResult {
    Counts(Vec<ImageCount>),
    Images(Paged<ImageExtra>),
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelExtra {
    pub id: i64,
    pub model_type: ModelType,
    pub filename: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub count: i64,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ListImagesOptions {
    pub project_ids: Option<Vec<i64>>,
    pub search: Option<String>,
    pub filters: Option<Vec<ListImagesFilter>>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub take: Option<i32>,
    pub skip: Option<i32>,
    pub count: Option<bool>,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ProjectExtra {
    pub id: i64,
    pub fingerprint: String,
    pub path: String,
    pub image_count: i64,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub missing_on: Option<i64>,
    pub excluded: bool,
}

#[derive(Debug)]
pub enum MixedError {
    SeaOrm(DbErr),
    Io(std::io::Error),
    Other(String),
    Sqlx(sqlx::Error),
    Transaction(sea_orm::TransactionError<DbErr>),
}

impl std::fmt::Display for MixedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", mixed_error_to_string(&self))
    }
}

impl From<std::string::String> for MixedError {
    fn from(e: std::string::String) -> Self {
        MixedError::Other(e)
    }
}

impl From<std::io::Error> for MixedError {
    fn from(e: std::io::Error) -> Self {
        MixedError::Io(e)
    }
}

impl From<sqlx::Error> for MixedError {
    fn from(e: sqlx::Error) -> Self {
        MixedError::Sqlx(e)
    }
}

impl From<DbErr> for MixedError {
    fn from(e: DbErr) -> Self {
        MixedError::SeaOrm(e)
    }
}

impl From<sea_orm::TransactionError<DbErr>> for MixedError {
    fn from(e: sea_orm::TransactionError<DbErr>) -> Self {
        MixedError::Transaction(e)
    }
}

fn mixed_error_to_string(error: &MixedError) -> String {
    match error {
        MixedError::Sqlx(e) => e.to_string(),
        MixedError::SeaOrm(e) => e.to_string(),
        MixedError::Io(e) => e.to_string(),
        MixedError::Other(e) => e.to_string(),
        MixedError::Transaction(e) => e.to_string(),
    }
}

impl From<MixedError> for String {
    fn from(err: MixedError) -> String {
        err.to_string()
    }
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ImageExtra {
    pub id: i64,
    pub project_id: i64,
    pub model_id: Option<i32>,
    pub model_file: Option<String>,
    pub prompt: String,
    pub negative_prompt: String,
    pub num_frames: Option<i16>,
    pub preview_id: i64,
    pub node_id: i64,
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_shuffle: bool,
    pub start_width: i32,
    pub start_height: i32,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: u64,
}

type ModelTypeAndFile = (String, ModelType);
struct NodeModelWeight {
    pub node_id: i64,
    pub model_id: i64,
    pub weight: f32,
}

fn get_all_models_from_tensor_history(h: &TensorHistoryImport) -> Vec<ModelTypeAndFile> {
    let mut all_image_models: Vec<ModelTypeAndFile> = Vec::new();
    all_image_models.push((h.model.clone(), ModelType::Model));
    if let Some(refiner) = &h.refiner_model {
        all_image_models.push((refiner.clone(), ModelType::Model));
    }
    if let Some(upscaler) = &h.upscaler {
        all_image_models.push((upscaler.clone(), ModelType::Upscaler));
    }
    for lora in &h.loras {
        all_image_models.push((lora.model.clone(), ModelType::Lora));
    }
    for control in &h.controls {
        all_image_models.push((control.model.clone(), ModelType::Cnet));
    }
    all_image_models
}

fn default_true() -> bool {
    true
}
#[derive(Deserialize)]
pub struct ModelInfoImport {
    pub file: String,
    pub name: String,
    pub version: String,
    #[serde(default = "default_true")]
    pub is_new: bool,
}
