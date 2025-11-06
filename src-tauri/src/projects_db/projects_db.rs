use std::collections::HashSet;

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::Serialize;
use tokio::sync::OnceCell;

use entity::{images, projects};
use migration::{Migrator, MigratorTrait};
use sea_orm::{
    sea_query::{Expr, OnConflict},
    ActiveModelTrait, ColumnTrait, Database, DatabaseConnection, DbErr, EntityTrait,
    FromQueryResult, JoinType, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
    RelationTrait, Set, TransactionTrait,
};
use sqlx::{migrate::MigrateDatabase, Sqlite};
use tauri::{Emitter, Manager};

use crate::projects_db::DTProject;

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
            println!("init database");
            ProjectsDb::new(&get_path(app_handle))
                .await
                .map_err(|e| e.to_string())
        })
        .await
    }

    pub fn get() -> Result<&'static ProjectsDb, String> {
        CELL.get().ok_or("Database not initialized".to_string())
    }

    pub async fn new(db_path: &str) -> Result<Self, DbErr> {
        // if !Sqlite::database_exists(db_path).await.unwrap_or(false) {
        //     println!("Creating database {}", db_path);
        //     match Sqlite::create_database(db_path).await {
        //         Ok(_) => println!("Create db success"),
        //         Err(error) => panic!("error: {}", error),
        //     }
        // } else {
        //     println!("Database already exists");
        // }

        let db = Database::connect(db_path).await?;

        // Apply all pending migrations
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

        let project = self.get_project(project.project_id).await?;

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

    pub async fn get_project(&self, id: i32) -> Result<ProjectExtra, DbErr> {
        use images::Entity as Images;
        use projects::Entity as Projects;

        let result = Projects::find_by_id(id)
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((Images, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(Expr::col((Images, images::Column::RowId)).max(), "last_id")
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
            .column_as(Expr::col((Images, images::Column::RowId)).max(), "last_id")
            .group_by(projects::Column::ProjectId)
            .into_model::<ProjectExtra>()
            .all(&self.db)
            .await?;

        Ok(results)
    }

    pub async fn scan_project<F>(&self, path: &str, mut on_progress: F) -> Result<(), MixedError>
    where
        F: FnMut(i32, i32),
    {
        let dt_project = DTProject::get(path).await?;
        let dt_project_info = dt_project.get_info().await?;
        let end = dt_project_info.history_max_id;
        let project = self.add_project(path).await?;
        let start = project.last_id.or(Some(-1)).unwrap();

        println!(
            "Scanning project {} from {} to {}, entries {}, last_id {}",
            path, start, end, dt_project_info.history_count, dt_project_info.history_max_id
        );

        let mut i = 0;
        for batch_start in (start..end).step_by(250) {
            let batch_end = (batch_start + 250).min(end);
            let histories = dt_project
                .get_tensor_history(batch_start, batch_end)
                .await?;

            // I know there's a better way to do this, because I used to do it with prisma
            let mut unique_models: HashSet<String> = HashSet::new();
            let used_models: Vec<entity::models::ActiveModel> = histories
                .iter()
                .filter_map(|h| {
                    if unique_models.contains(&h.model) {
                        return None;
                    }
                    unique_models.insert(h.model.clone());
                    Some(entity::models::ActiveModel {
                        filename: Set(h.model.clone()),
                        ..Default::default()
                    })
                })
                .collect();

            let _ = self
                .db
                .transaction::<_, (), DbErr>(|txn| {
                    Box::pin(async move {
                        let models: Vec<entity::models::Model> =
                            entity::models::Entity::insert_many(used_models)
                                .on_conflict(
                                    OnConflict::column(entity::models::Column::Filename)
                                        .update_column(entity::models::Column::Filename)
                                        .to_owned(),
                                )
                                .exec_with_returning_many(txn)
                                .await?;

                        let map: std::collections::HashMap<String, i32> = models
                            .iter()
                            .map(|m| (m.filename.clone(), m.model_id))
                            .collect();

                        let images: Vec<images::ActiveModel> = histories
                            .iter()
                            // .filter(|h| h.index_in_a_clip == 0 && h.generated)
                            .map(|h| images::ActiveModel {
                                project_id: Set(project.project_id as i64),
                                dt_id: Set(h.image_id as i64),
                                prompt: Set(Some(h.prompt.clone())),
                                negative_prompt: Set(Some(h.negative_prompt.clone())),
                                model_id: Set(map.get(&h.model).copied()),
                                row_id: Set(h.row_id as i64),
                                wall_clock: Set(DateTime::from_timestamp(h.wall_clock / 1000, 0)
                                    .unwrap()
                                    .naive_utc()),
                                ..Default::default()
                            })
                            .collect();
                        let _ = entity::images::Entity::insert_many(images)
                            .on_conflict(
                                OnConflict::columns([
                                    images::Column::RowId,
                                    images::Column::ProjectId,
                                ])
                                .do_nothing()
                                .to_owned(),
                            )
                            .do_nothing()
                            .exec(txn)
                            .await?;
                        Ok(())
                    })
                })
                .await?;

            on_progress(batch_end as i32, end as i32);
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
                        project_path: proj.path.clone(),
                        images_scanned,
                        images_total,
                    },
                )
                .unwrap();
            };

            if let Err(err) = self.scan_project(&proj.path, update).await {
                eprintln!("Error scanning project {}: {}", proj.path, err);
            }
            projects_scanned += 1;
            let upd_proj = self.get_project(proj.project_id).await?;
        }

        Ok(())
    }

pub async fn find_images(
    &self,
    term: &str,
    opts: ListImagesOptions,
) -> Result<Paged<ImageExtra>, DbErr> {
    print!("ListImagesOptions: {:#?}, FindImagesOptions: {:#?}\n", term, opts);

    // Base query without pagination
    let mut base_query = images::Entity::find()
        .join(JoinType::LeftJoin, images::Relation::Models.def())
        .filter(images::Column::Prompt.contains(term));

    if let Some(project_id) = opts.project_id {
        base_query = base_query.filter(images::Column::ProjectId.eq(project_id));
    }

    // Clone before applying limit/offset
    let mut data_query = base_query.clone()
        .order_by(images::Column::WallClock, Order::Desc)
        .column_as(entity::models::Column::Filename, "model_file");

    if let Some(skip) = opts.skip {
        data_query = data_query.offset(skip);
    }

    if let Some(take) = opts.take {
        data_query = data_query.limit(take);
    }

    // 1️⃣ Count total
    let total = base_query.clone().count(&self.db).await?;

    // 2️⃣ Fetch limited data
    let items = data_query.into_model::<ImageExtra>().all(&self.db).await?;

    // 3️⃣ Combine
    Ok(Paged { items, total })
}

    pub async fn list_images(&self, opts: ListImagesOptions) -> Result<Vec<ImageExtra>, DbErr> {
        print!("ListImagesOptions: {:#?}\n", opts);

        let mut query = images::Entity::find()
            .join(JoinType::LeftJoin, images::Relation::Models.def())
            .column_as(entity::models::Column::Filename, "model_file")
            .order_by(images::Column::WallClock, Order::Desc);

        if let Some(project_id) = opts.project_id {
            query = query.filter(images::Column::ProjectId.eq(project_id));
        }

        if let Some(skip) = opts.skip {
            query = query.offset(skip);
        }

        if let Some(take) = opts.take {
            query = query.limit(take);
        }

        let result = query.into_model::<ImageExtra>().all(&self.db).await?;
        Ok(result)
    }
}

#[derive(Debug, Serialize)]
pub struct ListImagesOptions {
    pub project_id: Option<u64>,
    pub model: Option<String>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub take: Option<u64>,
    pub skip: Option<u64>,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct ProjectExtra {
    pub project_id: i32,
    pub path: String,
    pub image_count: i64,
    pub last_id: Option<i64>,
}

#[derive(Serialize, Clone)]
pub struct ScanProgress {
    pub projects_scanned: i32,
    pub projects_total: i32,
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
    pub image_id: i64,
    pub project_id: i64,
    pub model_id: Option<i32>,
    pub model_file: Option<String>,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub dt_id: i64,
    pub row_id: i64,
    pub wall_clock: NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: u64,
}