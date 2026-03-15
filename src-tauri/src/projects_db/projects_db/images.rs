use crate::projects_db::{
    dtos::image::{ImageCount, ImageExtra, ListImagesOptions, ListImagesResult},
    dtos::tensor::TensorHistoryClip,
    folder_cache, search, DTProject,
};
use entity::{images, projects, watch_folders};
use sea_orm::{
    ColumnTrait, EntityTrait, ExprTrait, JoinType, Order, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, RelationTrait,
};
use sea_query::Expr;

use super::{MixedError, ProjectsDb};

impl ProjectsDb {
    pub async fn get_image_count(&self) -> Result<u32, MixedError> {
        let count = images::Entity::find().count(&self.db).await?;
        Ok(count as u32)
    }

    pub async fn get_image(&self, image_id: i64) -> Result<ImageExtra, MixedError> {
        let image = images::Entity::find_by_id(image_id)
            .join(JoinType::LeftJoin, images::Relation::Models.def())
            .join(JoinType::LeftJoin, images::Relation::Projects.def())
            .join(JoinType::LeftJoin, projects::Relation::WatchFolders.def())
            .column_as(entity::models::Column::Filename, "model_file")
            .column_as(
                Expr::col(watch_folders::Column::IsMissing)
                    .eq(false)
                    .and(Expr::col(watch_folders::Column::IsLocked).eq(false)),
                "is_ready",
            )
            .into_model::<ImageExtra>()
            .one(&self.db)
            .await?
            .ok_or_else(|| "Image not found".to_string())?;
        Ok(image)
    }

    pub async fn list_images(
        &self,
        opts: ListImagesOptions,
    ) -> Result<ListImagesResult, MixedError> {
        let direction = match opts.direction.as_deref() {
            Some("asc") => Order::Asc,
            _ => Order::Desc,
        };

        let mut query = images::Entity::find()
            .join(JoinType::LeftJoin, images::Relation::Models.def())
            .join(JoinType::LeftJoin, images::Relation::Projects.def())
            .join(JoinType::LeftJoin, projects::Relation::WatchFolders.def())
            .column_as(entity::models::Column::Filename, "model_file")
            .column_as(
                Expr::col(watch_folders::Column::IsMissing)
                    .eq(false)
                    .and(Expr::col(watch_folders::Column::IsLocked).eq(false)),
                "is_ready",
            )
            .order_by(images::Column::WallClock, direction);

        if let Some(project_ids) = &opts.project_ids {
            if !project_ids.is_empty() {
                query = query.filter(images::Column::ProjectId.is_in(project_ids.clone()));
            }
        }

        if let Some(search_text) = &opts.search {
            query = search::add_search(query, search_text);
        }

        if let Some(filters) = opts.filters {
            for f in filters {
                query = f.target.apply(f.operator, &f.value, query);
            }
        }

        let show_image = opts.show_image.unwrap_or(true);
        let show_video = opts.show_video.unwrap_or(true);

        if !show_image && !show_video {
            return Ok(ListImagesResult {
                counts: None,
                images: Some(vec![]),
                total: 0,
            });
        }

        if show_image && !show_video {
            query = query.filter(images::Column::NumFrames.is_null());
        } else if !show_image && show_video {
            query = query.filter(images::Column::NumFrames.is_not_null());
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

            let mut total: u64 = 0;
            let counts = project_counts
                .into_iter()
                .map(|p| {
                    total += p.count as u64;
                    ImageCount {
                        project_id: p.project_id,
                        count: p.count,
                    }
                })
                .collect();

            return Ok(ListImagesResult {
                counts: Some(counts),
                images: None,
                total,
            });
        }

        if let Some(skip) = opts.skip {
            query = query.offset(skip as u64);
        }

        if let Some(take) = opts.take {
            query = query.limit(take as u64);
        }

        let count = query.clone().count(&self.db).await?;
        let result = query.into_model::<ImageExtra>().all(&self.db).await?;

        Ok(ListImagesResult {
            images: Some(result),
            total: count,
            counts: None,
        })
    }

    pub async fn find_image_by_preview_id(
        &self,
        project_id: i64,
        preview_id: i64,
    ) -> Result<Option<ImageExtra>, MixedError> {
        let image = images::Entity::find()
            .filter(images::Column::ProjectId.eq(project_id))
            .filter(images::Column::PreviewId.eq(preview_id))
            .into_model::<ImageExtra>()
            .one(&self.db)
            .await?;

        Ok(image)
    }

    pub async fn get_clip(&self, image_id: i64) -> Result<Vec<TensorHistoryClip>, MixedError> {
        let result: Option<(String, i64, i64)> = images::Entity::find_by_id(image_id)
            .join(JoinType::InnerJoin, images::Relation::Projects.def())
            .select_only()
            .column(projects::Column::Path)
            .column(projects::Column::WatchfolderId)
            .column(images::Column::NodeId)
            .into_tuple()
            .one(&self.db)
            .await?;

        let (rel_path, watchfolder_id, node_id) =
            result.ok_or_else(|| "Image or Project not found".to_string())?;

        let watch_folder_path = folder_cache::get_folder(watchfolder_id)
            .ok_or_else(|| format!("Watch folder {watchfolder_id} not found in cache"))?;

        let full_path = std::path::Path::new(&watch_folder_path).join(rel_path);
        let full_path_str = full_path
            .to_str()
            .ok_or_else(|| "Invalid path encoding".to_string())?;

        let dt_project = DTProject::get(full_path_str).await?;
        let histories = dt_project.get_histories_from_clip(node_id).await?;
        Ok(histories)
    }
}
