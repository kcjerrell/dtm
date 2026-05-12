use crate::{
    bookmarks::{self, PickFolderResult},
    dtp_service::{
        events::DTPEvent,
        jobs::{SyncJob, UpdateProjectJob},
        AppHandleWrapper, DTPService,
    },
    projects_db::{
        dt_project::{TensorHistoryNode, ThnData, ThnFilter},
        dtos::{
            clip::ClipExtra, image::ListImagesResult, model::ModelExtra, project::ProjectExtra,
            tensor::TensorSize, watch_folder::WatchFolderDTO,
        },
        filters::ListImagesFilter,
        folder_cache, DecodeTensorOptions, DrawThingsMetadata, ProjectRef,
    },
};
use dtm_macros::dtp_commands;

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn list_projects(
        &self,
        watchfolder_id: Option<i64>,
    ) -> Result<Vec<ProjectExtra>, String> {
        let db = self.get_db().await?;
        Ok(db.list_projects(watchfolder_id).await?)
    }

    #[dtp_command]
    pub async fn update_project_exclude(
        &self,
        project_id: i64,
        exclude: bool,
    ) -> Result<(), String> {
        let db = self.get_db().await?;

        db.update_exclude(project_id, exclude).await?;

        if !exclude {
            self.add_job(UpdateProjectJob::from_id(&db, project_id, true, false).await?)
        }

        let project = db.get_project(project_id).await?;
        self.events
            .emit(crate::dtp_service::events::DTPEvent::ProjectUpdated(
                project,
            ));

        Ok(())
    }

    #[dtp_command]
    pub async fn list_images(
        &self,
        project_ids: Option<Vec<i64>>,
        search: Option<String>,
        filters: Option<Vec<ListImagesFilter>>,
        sort: Option<String>,
        direction: Option<String>,
        take: Option<i32>,
        skip: Option<i32>,
        count: Option<bool>,
        show_video: Option<bool>,
        show_image: Option<bool>,
        show_disconnected: Option<bool>,
    ) -> Result<ListImagesResult, String> {
        let db = self.get_db().await?;
        let opts = crate::projects_db::dtos::image::ListImagesOptions {
            project_ids,
            search,
            filters,
            sort,
            direction,
            take,
            skip,
            count,
            show_video,
            show_image,
            show_disconnected,
        };

        Ok(db.list_images(opts).await?)
    }

    #[dtp_command]
    pub async fn find_image_from_preview_id(
        &self,
        project_id: i64,
        preview_id: i64,
    ) -> Result<Option<crate::projects_db::dtos::image::ImageExtra>, String> {
        let db = self.get_db().await?;
        Ok(db.find_image_by_preview_id(project_id, preview_id).await?)
    }

    #[dtp_command]
    pub async fn get_clip(&self, image_id: i64, clip_id: i64) -> Result<ClipExtra, String> {
        let db = self.get_db().await?;
        Ok(db.get_clip(image_id, clip_id).await?)
    }

    #[dtp_command]
    pub async fn list_watch_folders(&self) -> Result<Vec<WatchFolderDTO>, String> {
        let db = self.get_db().await?;
        Ok(db.list_watch_folders().await?)
    }

    #[dtp_command]
    pub async fn pick_watch_folder(
        &self,
        dt_folder: Option<bool>,
        test_override: Option<String>,
    ) -> Result<(), String> {
        let result = get_folder(&self.app_handle, dt_folder, test_override).await?;
        self.internal_add_watch_folder(result.path, result.bookmark)
            .await
    }

    pub async fn add_watchfolder(
        self: &Self,
        path: String,
        bookmark: String,
    ) -> Result<(), String> {
        self.internal_add_watch_folder(path, bookmark).await
    }

    async fn internal_add_watch_folder(
        &self,
        path: String,
        bookmark: String,
    ) -> Result<(), String> {
        let db = self.get_db().await?;
        let folder = db.add_watch_folder(&path, &bookmark, false).await?;

        // Resolve the bookmark and update if needed
        let resolved = folder_cache::resolve_bookmark(folder.id, &bookmark).await;
        if let Ok(resolved) = resolved {
            match resolved {
                crate::bookmarks::ResolveResult::Resolved(updated_path) => {
                    if updated_path != path {
                        db.update_bookmark_path(folder.id, &bookmark, &updated_path)
                            .await?;
                    }
                }
                crate::bookmarks::ResolveResult::StaleRefreshed {
                    new_bookmark,
                    resolved_path,
                } => {
                    db.update_bookmark_path(folder.id, &new_bookmark, &resolved_path)
                        .await?;
                }
                crate::bookmarks::ResolveResult::CannotResolve => {
                    // TODO: Mark as missing in DB?
                }
            }
        }

        self.events
            .emit(crate::dtp_service::events::DTPEvent::WatchFoldersChanged);

        let scheduler = self.scheduler.read().await;
        let scheduler = scheduler.as_ref().unwrap();
        scheduler.add_job(SyncJob::new(false));
        Ok(())
    }

    #[dtp_command]
    pub async fn remove_watch_folder(&self, id: i64) -> Result<(), String> {
        let db = self.get_db().await?;
        db.remove_watch_folders(vec![id]).await?;

        self.events
            .emit(crate::dtp_service::events::DTPEvent::WatchFoldersChanged);

        // the projects will be removed automatically by the db
        self.events.emit(DTPEvent::ProjectsChanged);

        Ok(())
    }

    #[dtp_command]
    pub async fn update_watch_folder(&self, id: i64, recursive: bool) -> Result<(), String> {
        let db = self.get_db().await?;
        db.update_watch_folder(id, Some(recursive), None, None)
            .await?;

        self.events
            .emit(crate::dtp_service::events::DTPEvent::WatchFoldersChanged);

        Ok(())
    }

    #[dtp_command]
    pub async fn list_models(
        &self,
        model_type: Option<entity::enums::ModelType>,
    ) -> Result<Vec<ModelExtra>, String> {
        let db = self.get_db().await?;
        Ok(db.list_models(model_type).await?)
    }

    #[dtp_command]
    pub async fn get_history_full(
        &self,
        project_id: i64,
        row_id: i64,
    ) -> Result<TensorHistoryNode, String> {
        let project = self.get_project(project_id).await?;
        let mut nodes = project
            .get_tensor_history_nodes(
                Some(ThnFilter::Rowid(row_id)),
                Some(
                    ThnData::legacy_prompts()
                        .and_clip()
                        .and_moodboard()
                        .and_tensordata(),
                ),
            )
            .await
            .map_err(|e| e.to_string())?;
        nodes
            .into_iter()
            .next()
            .ok_or_else(|| format!("Node {} not found", row_id))
    }

    #[dtp_command]
    pub async fn get_metadata(&self, image_id: i64) -> Result<DrawThingsMetadata, String> {
        let pdb = self.get_db().await?;
        let image = pdb.get_image(image_id).await?;
        let dt_project = pdb.get_dt_project(ProjectRef::Id(image.project_id)).await?;
        let nodes = dt_project
            .get_tensor_history_nodes(Some(ThnFilter::Rowid(image.node_id)), None)
            .await
            .map_err(|e| e.to_string())?;
        let node = nodes
            .into_iter()
            .next()
            .ok_or_else(|| "Node not found".to_string())?;
        DrawThingsMetadata::try_from(&node.node_data()).map_err(|e| e.to_string())
    }

    #[dtp_command]
    pub async fn get_tensor_size(
        &self,
        project_id: i64,
        tensor_id: String,
    ) -> Result<TensorSize, String> {
        let project = self.get_project(project_id).await?;
        Ok(project
            .get_tensor_size(&tensor_id)
            .await
            .map_err(|e| e.to_string())?)
    }

    #[dtp_command]
    pub async fn decode_tensor(
        &self,
        project_id: i64,
        node_id: Option<i64>,
        tensor_id: String,
        as_png: bool,
    ) -> Result<tauri::ipc::Response, String> {
        let project = self.get_project(project_id).await?;
        let tensor = project
            .get_tensor_raw(&tensor_id)
            .await
            .map_err(|e| e.to_string())?;

        let metadata = match node_id {
            Some(node) => {
                let nodes = project
                    .get_tensor_history_nodes(Some(ThnFilter::Rowid(node)), None)
                    .await
                    .map_err(|e| e.to_string())?;
                nodes.into_iter().next().map(|n| n.node_data())
            }
            None => None,
        };

        let buffer = crate::projects_db::decode_tensor(
            tensor,
            DecodeTensorOptions {
                as_png,
                history_node: metadata,
                scale: None,
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(tauri::ipc::Response::new(buffer))
    }

    #[dtp_command]
    pub async fn find_predecessor(
        &self,
        _project_id: i64,
        _row_id: i64,
        _lineage: i64,
        _logical_time: i64,
    ) -> Result<Vec<TensorHistoryNode>, String> {
        // Pending rework — returns empty until find_predecessor_candidates is reimplemented.
        Ok(vec![])
    }

    // Helper method to get a DTProject instance
    async fn get_project(
        &self,
        project_id: i64,
    ) -> Result<std::sync::Arc<crate::projects_db::DTProject>, String> {
        let db = self.get_db().await?;
        let project_ref = crate::projects_db::ProjectRef::Id(project_id);
        Ok(db.get_dt_project(project_ref).await?)
    }
}

async fn get_dt_container(app_handle: &AppHandleWrapper) -> Result<String, String> {
    let path = app_handle
        .get_home_dir()
        .unwrap()
        .join("Library/Containers/com.liuliu.draw-things/Data");
    Ok(path.to_string_lossy().to_string())
}

async fn get_dt_data_folder(app_handle: &AppHandleWrapper) -> Result<String, String> {
    let path = app_handle
        .get_home_dir()
        .unwrap()
        .join("Library/Containers/com.liuliu.draw-things/Data/Documents");
    Ok(path.to_string_lossy().to_string())
}

async fn get_folder(
    app_handle: &AppHandleWrapper,
    dt_folder: Option<bool>,
    test_override: Option<String>,
) -> Result<PickFolderResult, String> {
    if let Some(test_override) = test_override {
        return Ok(PickFolderResult {
            path: test_override.clone(),
            bookmark: format!("TESTBOOKMARK::{}", test_override),
        });
    }

    let result = match dt_folder {
        Some(true) => {
            let result = bookmarks::pick_folder(
                app_handle,
                Some(get_dt_container(app_handle).await?),
                Some("Select Documents Folder".to_string()),
            )
            .await?;

            match result {
                Some(result) => {
                    if result.path != get_dt_data_folder(app_handle).await? {
                        return Err("Must select Documents folder".to_string());
                    }
                    result
                }
                None => {
                    return Err("Failed to select a folder".to_string());
                }
            }
        }
        _ => {
            let result = bookmarks::pick_folder(app_handle, None, None).await?;

            match result {
                Some(result) => result,
                None => {
                    return Err("Failed to select a folder".to_string());
                }
            }
        }
    };
    Ok(result)
}
