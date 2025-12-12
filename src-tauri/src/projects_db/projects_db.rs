use entity::{
    enums::{ModelType, Sampler},
    images::{self},
    projects,
};
use migration::{IntoIden, Migrator, MigratorTrait};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, Database, DatabaseConnection, DbErr, EntityTrait, FromQueryResult, JoinType, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, QueryTrait, RelationTrait, Set, sea_query::{Expr, OnConflict}
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::{Emitter, Manager};
use tokio::sync::OnceCell;

use crate::projects_db::{
    dt_project::{self, ProjectRef},
    filters::ListImagesFilter,
    DTProject, TensorHistoryImport,
};

static CELL: OnceCell<ProjectsDb> = OnceCell::const_new();

#[derive(Clone, Debug)]
pub struct ProjectsDb {
    db: DatabaseConnection,
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

    pub async fn add_project(&self, path: &str) -> Result<ProjectExtra, DbErr> {
        let project = projects::ActiveModel {
            path: Set(path.to_string()),
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

    pub async fn remove_project(&self, path: &str) -> Result<(), DbErr> {
        let delete_result = projects::Entity::delete_many()
            .filter(projects::Column::Path.eq(path))
            .exec(&self.db)
            .await?;

        if delete_result.rows_affected == 0 {
            // optional: handle if nothing was deleted
            println!("No project found for path: {}", path);
        }

        Ok(())
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
    ) -> Result<(), DbErr> {
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

        Ok(()) // or Ok(updated) depending on your typedef
    }

    pub async fn scan_project<F>(
        &self,
        path: &str,
        mut on_progress: F,
        full_scan: bool,
    ) -> Result<u64, MixedError>
    where
        F: FnMut(i32, i32),
    {
        let dt_project = DTProject::get(path).await?;
        let dt_project_info = dt_project.get_info().await?;
        let end = dt_project_info.history_max_id;
        let project = self.add_project(path).await?;

        if project.excluded {
            return Ok(0);
        }

        let start = match full_scan {
            true => 0,
            false => project.last_id.or(Some(-1)).unwrap(),
        };

        for batch_start in (start..end).step_by(250) {
            let histories = dt_project.get_tensor_history(batch_start, 250).await?;

            let histories_filtered: Vec<TensorHistoryImport> = histories
                .into_iter()
                .filter(|h| full_scan || (h.index_in_a_clip == 0 && h.generated))
                .collect();

            if histories_filtered.is_empty() {
                on_progress((batch_start + 250) as i32, end as i32);
                continue;
            }

            let models_lookup = self.process_models(&histories_filtered).await?;

            let (images, batch_image_loras, batch_image_controls) =
                self.prepare_image_data(project.id, &histories_filtered, &models_lookup);

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

            on_progress((batch_start + 250) as i32, end as i32);
        }

        Ok(self
            .list_images(ListImagesOptions {
                project_ids: Some([project.id].to_vec()),
                take: Some(0),
                ..Default::default()
            })
            .await?
            .total)
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
                let mut image = images::ActiveModel {
                    project_id: Set(project_id),
                    node_id: Set(h.row_id),
                    preview_id: Set(h.preview_id),
                    clip_id: Set(h.clip_id),
                    prompt: Set(Some(h.prompt.clone())),
                    negative_prompt: Set(Some(h.negative_prompt.clone())),
                    refiner_start: Set(Some(h.refiner_start)),
                    start_width: Set(h.width as i16),
                    start_height: Set(h.height as i16),
                    seed: Set(h.seed as i64),
                    strength: Set(h.strength),
                    steps: Set(h.steps as i16),
                    guidance_scale: Set(h.guidance_scale),
                    shift: Set(h.shift),
                    sampler: Set(Sampler::try_from(h.sampler).unwrap_or(Sampler::EulerA)), // Fallback instead of panic
                    hires_fix: Set(h.hires_fix),
                    tiled_decoding: Set(h.tiled_decoding),
                    tiled_diffusion: Set(h.tiled_diffusion),
                    tea_cache: Set(h.tea_cache),
                    cfg_zero_star: Set(h.cfg_zero_star),
                    wall_clock: Set(h.wall_clock.unwrap_or_default().and_utc()), // Handle missing wall_clock
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

    pub async fn scan_all_projects(&self, app: &tauri::AppHandle) -> Result<(), MixedError> {
        let projs = self.list_projects().await?;
        let projects_total = projs.len() as i32;

        let mut projects_scanned = 0;
        for proj in projs {
            let update = |images_scanned: i32, images_total: i32| {
                app.emit(
                    "projects_db_scan_progress",
                    ScanProgress {
                        projects_scanned,
                        projects_total,
                        project_final: -1,
                        project_path: proj.path.clone(),
                        images_scanned,
                        images_total,
                    },
                )
                .unwrap();
            };
            //

            match self.scan_project(&proj.path, update, false).await {
                Ok(total) => {
                    app.emit(
                        "projects_db_scan_progress",
                        ScanProgress {
                            projects_scanned,
                            projects_total,
                            project_final: total as i32,
                            project_path: proj.path.clone(),
                            images_scanned: -1,
                            images_total: -1,
                        },
                    )
                    .unwrap();
                }
                Err(err) => {
                    eprintln!("Error scanning project {}: {}", proj.path, err);
                }
            }
            projects_scanned += 1;
        }

        Ok(())
    }

    pub async fn list_images(&self, opts: ListImagesOptions) -> Result<Paged<ImageExtra>, DbErr> {
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
            let mut cond = Condition::any();
            for term in search.split_whitespace() {
                cond = cond.add(images::Column::Prompt.contains(term));
            }
            query = query.filter(cond);
        }

        if let Some(filters) = opts.filters {
            for f in filters {
                query = f.target.apply(f.operator, &f.value, query);
            }
        }

        if let Some(skip) = opts.skip {
            query = query.offset(skip as u64);
        }

        if let Some(take) = opts.take {
            query = query.limit(take as u64);
        }

        let stmt = query.clone().build(self.db.get_database_backend());
        println!("Query: {:#?}", stmt);

        let count = query.clone().count(&self.db).await?;
        let result = query.into_model::<ImageExtra>().all(&self.db).await?;
        Ok(Paged {
            items: result,
            total: count,
        })
    }

    pub async fn list_watch_folders(&self) -> Result<Vec<entity::watch_folders::Model>, DbErr> {
        let folder = entity::watch_folders::Entity::find()
            .into_model()
            .all(&self.db)
            .await?;

        Ok(folder)
    }

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
        recursive: bool,
    ) -> Result<entity::watch_folders::Model, DbErr> {
        let folder = entity::watch_folders::Entity::find_by_id(id)
            .one(&self.db)
            .await?;
        let mut folder: entity::watch_folders::ActiveModel = folder.unwrap().into();
        folder.recursive = Set(Some(recursive));

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
            images::Entity::delete_many()
                .filter(images::Column::ProjectId.eq(project_id))
                .exec(&self.db)
                .await?;
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

    pub async fn update_models(&self, models: Vec<ModelInfo>) -> Result<(), DbErr> {
        let models: Vec<entity::models::ActiveModel> = models
            .iter()
            .map(|m| entity::models::ActiveModel {
                filename: Set(m.file.clone()),
                name: Set(Some(m.name.clone())),
                version: Set(Some(m.version.clone())),
                model_type: Set(m.model_type),
                ..Default::default()
            })
            .collect();

        entity::models::Entity::insert_many(models)
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

        Ok(())
    }

    pub async fn scan_model_info(
        &self,
        path: &str,
        model_type: ModelType,
    ) -> Result<(), MixedError> {
        #[derive(Deserialize)]
        struct ModelInfoImport {
            file: String,
            name: String,
            version: String,
        }

        let file = std::fs::File::open(path)?;
        let reader = std::io::BufReader::new(file);
        let models: Vec<ModelInfoImport> =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;

        let models: Vec<ModelInfo> = models
            .into_iter()
            .map(|m| ModelInfo {
                file: m.file,
                name: m.name,
                version: m.version,
                model_type,
            })
            .collect();

        self.update_models(models).await?;

        Ok(())
    }

    pub async fn list_models(
        &self,
        model_type: Option<ModelType>,
    ) -> Result<Vec<ModelExtra>, DbErr> {
        let mut query = entity::models::Entity::find();

        if let Some(t) = model_type {
            query = query.filter(entity::models::Column::ModelType.eq(t));
        }

        let models = query.all(&self.db).await?;
        let mut results = Vec::new();

        for model in models {
            let count = match model.model_type {
                ModelType::Model => {
                    let c1 = entity::images::Entity::find()
                        .filter(entity::images::Column::ModelId.eq(model.id))
                        .count(&self.db)
                        .await?;
                    let c2 = entity::images::Entity::find()
                        .filter(entity::images::Column::RefinerId.eq(model.id))
                        .count(&self.db)
                        .await?;
                    c1 + c2
                }
                ModelType::Lora => {
                    entity::image_loras::Entity::find()
                        .filter(entity::image_loras::Column::LoraId.eq(model.id))
                        .count(&self.db)
                        .await?
                }
                ModelType::Cnet => {
                    entity::image_controls::Entity::find()
                        .filter(entity::image_controls::Column::ControlId.eq(model.id))
                        .count(&self.db)
                        .await?
                }
                ModelType::Upscaler => {
                    entity::images::Entity::find()
                        .filter(entity::images::Column::UpscalerId.eq(model.id))
                        .count(&self.db)
                        .await?
                }
                _ => 0,
            };

            if count > 0 {
                results.push(ModelExtra {
                    id: model.id,
                    model_type: model.model_type,
                    filename: model.filename,
                    name: model.name,
                    version: model.version,
                    count: count as i64,
                });
            }
        }

        // Sort by count desc
        results.sort_by(|a, b| b.count.cmp(&a.count));

        Ok(results)
    }
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
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ProjectExtra {
    pub id: i64,
    pub path: String,
    pub image_count: i64,
    pub last_id: Option<i64>,
    pub filesize: Option<i64>,
    pub modified: Option<i64>,
    pub excluded: bool,
}

#[derive(Serialize, Clone)]
pub struct ScanProgress {
    pub projects_scanned: i32,
    pub projects_total: i32,
    pub project_final: i32,
    pub project_path: String,
    pub images_scanned: i32,
    pub images_total: i32,
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
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub preview_id: i64,
    pub node_id: i64,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: u64,
}

#[derive(Debug, Deserialize)]
pub struct ModelInfo {
    pub file: String,
    pub name: String,
    pub version: String,
    pub model_type: ModelType,
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
