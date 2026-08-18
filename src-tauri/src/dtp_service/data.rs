#![allow(clippy::too_many_arguments)]

use crate::{
    bookmarks::{self, PickFolderResult},
    dt_project::{ClipExtra, TensorHistoryNode, TensorSize, ThnFilter},
    dtp_service::{
        events::DTPEvent,
        jobs::{SyncJob, UpdateProjectJob},
        AppHandleWrapper, DTPService,
    },
    projects_db::{
        dtos::{
            image::ListImagesResult, model::ModelExtra, project::ProjectExtra,
            watch_folder::WatchFolderDTO,
        },
        filters::ListImagesFilter,
        folder_cache, DecodeTensorOptions, DrawThingsMetadata, DtProjectRef,
    },
    IntoTAResult, TAResult,
};
use dtm_macros::dtp_commands;

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn list_projects(
        &self,
        watchfolder_id: Option<i64>,
    ) -> crate::TAResult<Vec<ProjectExtra>> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        Ok(db
            .list_projects(watchfolder_id)
            .await
            .map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn update_project_exclude(
        &self,
        project_id: i64,
        exclude: bool,
    ) -> crate::TAResult<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;

        db.update_exclude(project_id, exclude)
            .await
            .map_err(anyhow::Error::msg)?;

        if !exclude {
            self.add_job(
                UpdateProjectJob::from_id(&db, project_id, true, false)
                    .await
                    .map_err(anyhow::Error::msg)?,
            )
        }

        let project = db
            .get_project(project_id)
            .await
            .map_err(anyhow::Error::msg)?;
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
    ) -> crate::TAResult<ListImagesResult> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
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

        Ok(db.list_images(opts).await.map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn find_image_from_preview_id(
        &self,
        project_id: i64,
        preview_id: i64,
    ) -> crate::TAResult<Option<crate::projects_db::dtos::image::ImageExtra>> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        Ok(db
            .find_image_by_preview_id(project_id, preview_id)
            .await
            .map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn get_clip(&self, image_id: i64, clip_id: i64) -> TAResult<ClipExtra> {
        let db = self.get_db().await.map_err(|e| anyhow::anyhow!(e))?;
        Ok(db.get_clip(image_id, clip_id).await?)
    }

    #[dtp_command]
    pub async fn list_watch_folders(&self) -> crate::TAResult<Vec<WatchFolderDTO>> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        Ok(db.list_watch_folders().await.map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn pick_watch_folder(
        &self,
        dt_folder: Option<bool>,
        test_override: Option<String>,
    ) -> crate::TAResult<()> {
        let result = get_folder(&self.app_handle, dt_folder, test_override)
            .await
            .map_err(anyhow::Error::msg)?;
        self.internal_add_watch_folder(result.path, result.bookmark)
            .await
            .map_err(anyhow::Error::msg)?;
        Ok(())
    }

    pub async fn add_watchfolder(&self, path: String, bookmark: String) -> anyhow::Result<()> {
        self.internal_add_watch_folder(path, bookmark)
            .await
            .map_err(anyhow::Error::msg)
    }

    async fn internal_add_watch_folder(
        &self,
        path: String,
        bookmark: String,
    ) -> anyhow::Result<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        let folder = db
            .add_watch_folder(&path, &bookmark, false)
            .await
            .map_err(anyhow::Error::msg)?;

        // Resolve the bookmark and update if needed
        let resolved = folder_cache::resolve_bookmark(folder.id, &bookmark).await;
        if let Ok(resolved) = resolved {
            match resolved {
                crate::bookmarks::ResolveResult::Resolved(updated_path) => {
                    if updated_path != path {
                        db.update_bookmark_path(folder.id, &bookmark, &updated_path)
                            .await
                            .map_err(anyhow::Error::msg)?;
                    }
                }
                crate::bookmarks::ResolveResult::StaleRefreshed {
                    new_bookmark,
                    resolved_path,
                } => {
                    db.update_bookmark_path(folder.id, &new_bookmark, &resolved_path)
                        .await
                        .map_err(anyhow::Error::msg)?;
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
    pub async fn remove_watch_folder(&self, id: i64) -> crate::TAResult<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        db.remove_watch_folders(vec![id])
            .await
            .map_err(anyhow::Error::msg)?;

        self.events
            .emit(crate::dtp_service::events::DTPEvent::WatchFoldersChanged);

        // the projects will be removed automatically by the db
        self.events.emit(DTPEvent::ProjectsChanged);

        Ok(())
    }

    #[dtp_command]
    pub async fn update_watch_folder(&self, id: i64, recursive: bool) -> crate::TAResult<()> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        db.update_watch_folder(id, Some(recursive), None, None)
            .await
            .map_err(anyhow::Error::msg)?;

        self.events
            .emit(crate::dtp_service::events::DTPEvent::WatchFoldersChanged);

        Ok(())
    }

    #[dtp_command]
    pub async fn list_models(
        &self,
        model_type: Option<entity::enums::ModelType>,
    ) -> crate::TAResult<Vec<ModelExtra>> {
        let db = self.get_db().await.map_err(anyhow::Error::msg)?;
        Ok(db
            .list_models(model_type)
            .await
            .map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn get_metadata(&self, image_id: i64) -> crate::TAResult<DrawThingsMetadata> {
        let pdb = self.get_db().await.map_err(anyhow::Error::msg)?;
        let image = pdb.get_image(image_id).await.map_err(anyhow::Error::msg)?;
        let dt_project = pdb
            .get_dt_project(DtProjectRef::Id(image.project_id))
            .await
            .map_err(anyhow::Error::msg)?;
        let nodes = dt_project
            .get_tensor_history_nodes(Some(ThnFilter::Rowid(image.node_id)), None)
            .await
            .map_err(anyhow::Error::msg)?;
        let node = nodes
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Node not found"))?;
        Ok(DrawThingsMetadata::try_from(&node.node_data()).map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn get_tensor_size(
        &self,
        project_id: i64,
        tensor_id: String,
    ) -> crate::TAResult<TensorSize> {
        let project_ref = DtProjectRef::Id(project_id);
        let dt_project = project_ref.get_project().await?;
        Ok(dt_project
            .get_tensor_size(&tensor_id)
            .await
            .map_err(anyhow::Error::msg)?)
    }

    #[dtp_command]
    pub async fn decode_tensor(
        &self,
        project_id: i64,
        node_id: Option<i64>,
        tensor_id: String,
        as_png: bool,
    ) -> crate::TAResult<tauri::ipc::Response> {
        let project = self
            .get_project(project_id)
            .await
            .map_err(anyhow::Error::msg)?;
        let tensor = project
            .get_tensor_raw(&tensor_id)
            .await
            .map_err(anyhow::Error::msg)?;

        let metadata = match node_id {
            Some(node) => {
                let nodes = project
                    .get_tensor_history_nodes(Some(ThnFilter::Rowid(node)), None)
                    .await
                    .map_err(anyhow::Error::msg)?;
                nodes.into_iter().next().map(|n| n.node_data())
            }
            None => None,
        };

        let buffer = crate::projects_db::decode_tensor(
            tensor,
            DecodeTensorOptions {
                as_png,
                history_node: metadata,
                size: None,
            },
        )?;
        Ok(tauri::ipc::Response::new(buffer))
    }

    #[dtp_command]
    pub async fn find_predecessor(
        &self,
        project_id: i64,
        row_id: i64,
    ) -> crate::TAResult<Vec<TensorHistoryNode>> {
        let project_ref = DtProjectRef::Id(project_id);
        let dtp = project_ref.get_project().await?;
        let nodes = dtp.get_predecessors(row_id).await.into_ta_result()?;
        // .get_tensor_history_nodes(
        //     Some(ThnFilter::Predecessor(row_id, lineage, logical_time)),
        //     Some(ThnData::tensordata()),
        // )
        // .await
        // .into_ta_result()?;

        Ok(nodes)
    }

    // Helper method to get a DTProject instance
    async fn get_project(
        &self,
        project_id: i64,
    ) -> anyhow::Result<std::sync::Arc<crate::projects_db::DTProject>> {
        let project_ref = DtProjectRef::Id(project_id);
        project_ref.get_project().await
    }
}

async fn get_dt_container(app_handle: &AppHandleWrapper) -> anyhow::Result<String> {
    let path = app_handle
        .get_home_dir()
        .unwrap()
        .join("Library/Containers/com.liuliu.draw-things/Data");
    Ok(path.to_string_lossy().to_string())
}

async fn get_dt_data_folder(app_handle: &AppHandleWrapper) -> anyhow::Result<String> {
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
) -> anyhow::Result<PickFolderResult> {
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
                        return Err(anyhow::anyhow!("Must select Documents folder"));
                    }
                    result
                }
                None => {
                    return Err(anyhow::anyhow!("Failed to select a folder"));
                }
            }
        }
        _ => {
            let result = bookmarks::pick_folder(app_handle, None, None).await?;

            match result {
                Some(result) => result,
                None => {
                    return Err(anyhow::anyhow!("Failed to select a folder"));
                }
            }
        }
    };
    Ok(result)
}
