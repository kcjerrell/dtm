use crate::projects_db::dtos::watch_folder::WatchFolderDTO;
use entity::watch_folders;
use sea_orm::{
    sea_query::Expr, ActiveModelBehavior, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter,
    QueryOrder, Set,
};

use super::{MixedError, ProjectsDb};

impl ProjectsDb {
    pub async fn list_watch_folders(&self) -> Result<Vec<WatchFolderDTO>, MixedError> {
        let folders = watch_folders::Entity::find()
            .order_by_asc(watch_folders::Column::Path)
            .all(&self.db)
            .await?;

        Ok(folders.into_iter().map(|f| f.into()).collect())
    }

    pub async fn add_watch_folder(
        &self,
        path: &str,
        bookmark: &str,
        recursive: bool,
    ) -> Result<WatchFolderDTO, MixedError> {
        let model = watch_folders::ActiveModel {
            path: Set(path.to_string()),
            bookmark: Set(bookmark.to_string()),
            recursive: Set(Some(recursive)),
            ..Default::default()
        }
        .insert(&self.db)
        .await?;

        Ok(model.into())
    }

    pub async fn something(&self) -> Result<(), String> {
        self.remove_watch_folders(vec![1]).await?;
        Ok(())
    }

    pub async fn remove_watch_folders(&self, ids: Vec<i64>) -> Result<(), MixedError> {
        if ids.is_empty() {
            return Ok(());
        }

        watch_folders::Entity::delete_many()
            .filter(watch_folders::Column::Id.is_in(ids))
            .exec(&self.db)
            .await?;

        Ok(())
    }

    pub async fn update_watch_folder(
        &self,
        id: i64,
        recursive: Option<bool>,
        is_missing: Option<bool>,
        is_locked: Option<bool>,
    ) -> Result<WatchFolderDTO, MixedError> {
        let mut model = watch_folders::ActiveModel::new();
        model.id = Set(id);
        if let Some(r) = recursive {
            model.recursive = Set(Some(r));
        }

        if let Some(is_missing) = is_missing {
            model.is_missing = Set(is_missing);
        }

        if let Some(is_locked) = is_locked {
            model.is_locked = Set(is_locked);
        }

        let model = model.update(&self.db).await?;
        Ok(model.into())
    }

    pub async fn update_bookmark_path(
        &self,
        id: i64,
        bookmark: &str,
        path: &str,
    ) -> Result<WatchFolderDTO, MixedError> {
        let mut model: watch_folders::ActiveModel = watch_folders::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or_else(|| MixedError::Other(format!("Watch folder {id} not found")))?
            .into();

        model.bookmark = Set(bookmark.to_string());
        model.path = Set(path.to_string());

        let model = model.update(&self.db).await?;
        Ok(model.into())
    }

    pub async fn get_watch_folder_for_path(
        &self,
        path: &str,
    ) -> Result<Option<WatchFolderDTO>, MixedError> {
        let folder = watch_folders::Entity::find()
            .filter(Expr::cust_with_values("? LIKE path || '/%'", [path]))
            .one(&self.db)
            .await?;

        Ok(folder.map(|f| f.into()))
    }

    pub async fn get_watch_folder_by_path(
        &self,
        path: &str,
    ) -> Result<Option<WatchFolderDTO>, MixedError> {
        let folder = watch_folders::Entity::find()
            .filter(watch_folders::Column::Path.eq(path))
            .one(&self.db)
            .await?;

        Ok(folder.map(|f| f.into()))
    }
}
