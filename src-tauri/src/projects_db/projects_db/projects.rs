use crate::projects_db::{
    dtos::project::{ProjectExtra, ProjectRow},
    folder_cache, DTProject,
};
use entity::{
    images::{self, Entity as Images},
    projects::{self, ActiveModel, Entity as Projects},
    watch_folders,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, ExprTrait, JoinType, QueryFilter, QuerySelect,
    RelationTrait, Set,
};
use sea_query::{Expr, OnConflict};

use super::{MixedError, ProjectsDb};

impl ProjectsDb {
    pub async fn add_project(
        &self,
        watch_folder_id: i64,
        relative_path: &str,
    ) -> Result<ProjectExtra, MixedError> {
        let watch_folder_path = folder_cache::get_folder(watch_folder_id)
            .ok_or_else(|| "Watch folder not found in cache".to_string())?;
        let full_path = std::path::Path::new(&watch_folder_path).join(relative_path);
        let full_path_str = full_path
            .to_str()
            .ok_or_else(|| "Invalid path".to_string())?;

        let dt_project = DTProject::get(full_path_str).await?;
        let fingerprint = dt_project.get_fingerprint().await?;

        let project = ActiveModel {
            path: Set(relative_path.to_string()),
            watchfolder_id: Set(watch_folder_id),
            fingerprint: Set(fingerprint),
            ..Default::default()
        };

        let project = Projects::insert(project)
            .on_conflict(
                OnConflict::columns([
                    entity::projects::Column::Path,
                    entity::projects::Column::WatchfolderId,
                ])
                .value(entity::projects::Column::Path, relative_path)
                .to_owned(),
            )
            .exec_with_returning(&self.db)
            .await?;

        let project = self.get_project(project.id).await?;

        Ok(project)
    }

    pub async fn remove_project(&self, id: i64) -> Result<Option<i64>, MixedError> {
        let _ = Projects::delete_by_id(id).exec(&self.db).await?;

        Ok(Some(id))
    }

    pub async fn get_project(&self, id: i64) -> Result<ProjectExtra, MixedError> {
        let result = Projects::find_by_id(id)
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((images::Entity, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(
                Expr::col((images::Entity, images::Column::NodeId)).max(),
                "last_id",
            )
            .join(JoinType::LeftJoin, projects::Relation::WatchFolders.def())
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::Path)),
                "watchfolder_path",
            )
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::IsMissing)),
                "is_missing",
            )
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::IsLocked)),
                "is_locked",
            )
            .group_by(projects::Column::Id)
            .into_model::<ProjectRow>()
            .one(&self.db)
            .await?;

        Ok(result.unwrap().into())
    }

    pub async fn get_project_by_path(
        &self,
        watchfolder_id: i64,
        path: &str,
    ) -> Result<Option<ProjectExtra>, MixedError> {
        let project = project_query()
            .filter(projects::Column::WatchfolderId.eq(watchfolder_id))
            .filter(projects::Column::Path.eq(path))
            .into_model::<ProjectRow>()
            .one(&self.db)
            .await?;

        Ok(project.map(|r| r.into()))
    }

    pub async fn list_projects(
        &self,
        watchfolder_id: Option<i64>,
    ) -> Result<Vec<ProjectExtra>, MixedError> {
        let mut query = Projects::find();

        if let Some(watchfolder_id) = watchfolder_id {
            query = query.filter(projects::Column::WatchfolderId.eq(watchfolder_id));
        }

        let query = query
            .join(JoinType::LeftJoin, projects::Relation::Images.def())
            .column_as(
                Expr::col((Images, images::Column::ProjectId)).count(),
                "image_count",
            )
            .column_as(Expr::col((Images, images::Column::Id)).max(), "last_id")
            .join(JoinType::LeftJoin, projects::Relation::WatchFolders.def())
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::Path)),
                "watchfolder_path",
            )
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::IsMissing)),
                "is_missing",
            )
            .column_as(
                Expr::col((watch_folders::Entity, watch_folders::Column::IsLocked)),
                "is_locked",
            )
            .group_by(projects::Column::Id)
            .into_model::<ProjectRow>();

        let results = query.all(&self.db).await?;

        Ok(results.into_iter().map(|r| r.into()).collect())
    }

    // extra calls
    pub async fn update_project(
        &self,
        project_id: i64,
        filesize: Option<i64>,
        modified: Option<i64>,
    ) -> Result<ProjectExtra, MixedError> {
        let mut project = projects::ActiveModel {
            id: Set(project_id),
            ..Default::default()
        };

        if let Some(v) = filesize {
            project.filesize = Set(Some(v));
        }
        if let Some(v) = modified {
            project.modified = Set(Some(v));
        }

        let result = project.update(&self.db).await?;
        let updated = self.get_project(result.id).await?;

        Ok(updated)
    }

    pub async fn update_exclude(&self, project_id: i64, exclude: bool) -> Result<(), MixedError> {
        let project = Projects::find_by_id(project_id)
            .one(&self.db)
            .await?
            .ok_or_else(|| MixedError::Other(format!("Project {project_id} not found")))?;

        let mut project: projects::ActiveModel = project.into();
        project.excluded = Set(exclude);
        project.modified = Set(None);
        project.filesize = Set(None);
        project.update(&self.db).await?;

        if exclude {
            log::debug!("Excluding project {}", project_id);
            // Remove all images associated with this project
            // Cascade delete will handle image_controls and image_loras
            let result = images::Entity::delete_many()
                .filter(images::Column::ProjectId.eq(project_id))
                .exec(&self.db)
                .await?;
            log::debug!("Deleted {} images", result.rows_affected);
        }

        Ok(())
    }

    pub async fn get_dt_project(
        &self,
        project_ref: crate::projects_db::dt_project::ProjectRef,
    ) -> Result<std::sync::Arc<DTProject>, MixedError> {
        let full_path = match project_ref {
            crate::projects_db::dt_project::ProjectRef::Id(id) => {
                let project = self.get_project(id).await?;
                project.full_path
            }
        };

        Ok(DTProject::get(&full_path).await?)
    }
}

fn project_query() -> sea_orm::Select<entity::prelude::Projects> {
    projects::Entity::find()
        .join(JoinType::LeftJoin, projects::Relation::Images.def())
        .column_as(
            Expr::col((Images, images::Column::ProjectId)).count(),
            "image_count",
        )
        .column_as(Expr::col((Images, images::Column::Id)).max(), "last_id")
        .join(JoinType::LeftJoin, projects::Relation::WatchFolders.def())
        .column_as(
            Expr::col((watch_folders::Entity, watch_folders::Column::Path)),
            "watchfolder_path",
        )
        .column_as(
            Expr::col((watch_folders::Entity, watch_folders::Column::IsMissing)),
            "is_missing",
        )
        .column_as(
            Expr::col((watch_folders::Entity, watch_folders::Column::IsLocked)),
            "is_locked",
        )
        .group_by(projects::Column::Id)
}
