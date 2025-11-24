use std::collections::HashSet;

use chrono::{DateTime, NaiveDateTime};
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

use entity::{
    images::{self},
    enums::{Sampler, ModelType},
    projects,
};
use migration::{Migrator, MigratorTrait};
use sea_orm::{
    ActiveModelAction, ActiveModelTrait, ColumnTrait, ConnectionTrait, Database, DatabaseConnection, DbErr, EntityTrait, FromQueryResult, JoinType, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set, Statement, TransactionTrait, TryInsertResult, sea_query::{Expr, OnConflict}
};
use tauri::{Emitter, Manager};

use crate::projects_db::{
    dt_project::{self, ProjectRef},
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
            let histories = dt_project
                .get_tensor_history(batch_start, 250)
                .await?;

            let images: Vec<images::ActiveModelEx> = histories
                .iter()
                .filter(|h| full_scan || (h.index_in_a_clip == 0 && h.generated))
                .map(|h: &TensorHistoryImport| {
                    let mut image = images::ActiveModel::builder()
                        .set_project_id(project.id)
                        .set_node_id(h.row_id)
                        .set_preview_id(h.preview_id)
                        .set_clip_id(h.clip_id)
                        .set_prompt(Some(h.prompt.clone()))
                        .set_negative_prompt(Some(h.negative_prompt.clone()))
                        .set_model(
                            entity::models::ActiveModel::builder()
                                .set_filename(h.model.clone())
                                .set_model_type(ModelType::Model),
                        )
                        .set_refiner_start(Some(h.refiner_start))
                        .set_start_width(h.width as i16)
                        .set_start_height(h.height as i16)
                        .set_seed(h.seed as i64)
                        .set_strength(h.strength)
                        .set_steps(h.steps as i16)
                        .set_guidance_scale(h.guidance_scale)
                        .set_shift(h.shift)
                        .set_sampler(Sampler::try_from(h.sampler).unwrap())
                        .set_hires_fix(h.hires_fix)
                        .set_tiled_decoding(h.tiled_decoding)
                        .set_tiled_diffusion(h.tiled_diffusion)
                        .set_tea_cache(h.tea_cache)
                        .set_cfg_zero_star(h.cfg_zero_star)
                        .set_wall_clock(h.wall_clock.unwrap().and_utc());

                    if let Some(refiner) = &h.refiner_model {
                        image = image.set_refiner(
                            entity::models::ActiveModel::builder()
                                .set_filename(refiner)
                                .set_model_type(ModelType::Model),
                        );
                    }

                    if let Some(upscaler) = &h.upscaler {
                        image = image.set_upscaler(
                            entity::models::ActiveModel::builder()
                                .set_filename(upscaler)
                                .set_model_type(ModelType::Upscaler),
                        );
                    }

                    image
                })
                .collect();

            for image in images {
                // entity::images::Entity::insert(image)
                //     .on_conflict(
                //         OnConflict::columns(vec![
                //             entity::images::Column::NodeId,
                //             entity::images::Column::ProjectId,
                //         ])
                //         .do_nothing()
                //         .to_owned(),
                //     )
                //     .exec_without_returning(&self.db)
                //     .await?;
                let im = image.clone();
                let projid = im.project_id.into_value().unwrap();
                let nodeid = im.node_id.into_value().unwrap();
                match image.save(&self.db).await {
                    Ok(_) => {},
                    Err(e) => {
                        println!("Error saving image: {} {}", projid, nodeid);
                    }
                }
            }

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
        print!("ListImagesOptions: {:#?}\n", opts);

        let mut query = images::Entity::find()
            .join(JoinType::LeftJoin, images::Relation::Models.def())
            .column_as(entity::models::Column::Filename, "model_file")
            .order_by(images::Column::WallClock, Order::Desc);

        if let Some(project_ids) = &opts.project_ids {
            if !project_ids.is_empty() {
                query = query.filter(images::Column::ProjectId.is_in(project_ids.clone()));
            }
        }

        if let Some(node_id) = opts.node_id {
            query = query.filter(images::Column::NodeId.eq(node_id));
        }

        if let Some(search) = &opts.search {
            query = query.filter(images::Column::Prompt.contains(search));
        }

        if let Some(skip) = opts.skip {
            query = query.offset(skip as u64);
        }

        if let Some(take) = opts.take {
            query = query.limit(take as u64);
        }
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
}


#[derive(Debug, Serialize, Clone, Default)]
pub struct ListImagesOptions {
    pub project_ids: Option<Vec<i64>>,
    pub node_id: Option<i64>,
    pub model: Option<String>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub take: Option<i32>,
    pub skip: Option<i32>,
    pub search: Option<String>,
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
