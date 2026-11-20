use crate::projects_db::dtos::watch_folder::WatchFolderDTO;
use entity::watch_folders;
use sea_orm::{
    ActiveModelBehavior, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set,
};

use super::{MixedError, ProjectsDb};

impl ProjectsDb {
    pub async fn get_watch_folder(&self, id: i64) -> Result<Option<WatchFolderDTO>, MixedError> {
        Ok(watch_folders::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .map(Into::into))
    }

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

    pub async fn remove_watch_folders(&self, ids: &[i64]) -> Result<(), MixedError> {
        if ids.is_empty() {
            return Ok(());
        }

        let folders = watch_folders::Entity::find()
            .filter(watch_folders::Column::Id.is_in(ids))
            .all(&self.db)
            .await?;
        watch_folders::Entity::delete_many()
            .filter(watch_folders::Column::Id.is_in(ids))
            .exec(&self.db)
            .await?;

        super::projects::clear_project_paths();
        for folder in folders {
            crate::projects_db::folder_cache::CACHE
                .write()
                .unwrap()
                .remove(&folder.id);
            crate::dt_project::close_folder(&folder.path).await;
            crate::archive::DTZipCache::close_folder(&folder.path)
                .await
                .map_err(|error| MixedError::Other(format!("{error:#}")))?;
        }
        self.rebuild_images_fts_debounced();
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

        let previous = self
            .get_watch_folder(id)
            .await?
            .ok_or_else(|| MixedError::Other(format!("Watch folder {id} not found")))?;
        model.bookmark = Set(bookmark.to_string());
        model.path = Set(path.to_string());

        let model = model.update(&self.db).await?;
        crate::projects_db::folder_cache::CACHE
            .write()
            .unwrap()
            .insert(id, std::path::PathBuf::from(path));
        super::projects::clear_project_paths();
        crate::dt_project::close_folder(&previous.path).await;
        crate::archive::DTZipCache::close_folder(&previous.path)
            .await
            .map_err(|error| MixedError::Other(format!("{error:#}")))?;
        Ok(model.into())
    }

    pub async fn get_watch_folder_for_path(
        &self,
        path: &str,
    ) -> Result<Option<WatchFolderDTO>, MixedError> {
        // Match path components, not SQL LIKE wildcards, and prefer the most
        // specific folder when watch folders overlap.
        let path = std::path::Path::new(path);
        Ok(self
            .list_watch_folders()
            .await?
            .into_iter()
            .filter(|f| path.starts_with(&f.path) && path != std::path::Path::new(&f.path))
            .max_by_key(|f| f.path.len()))
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
