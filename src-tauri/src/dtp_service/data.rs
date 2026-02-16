use dtm_macros::{dtp_command, dtp_commands};

use crate::{
    dtp_service::DTPService,
    projects_db::{
        dtos::{
            image::ListImagesResult,
            model::ModelExtra,
            project::ProjectExtra,
            tensor::{TensorHistoryClip, TensorHistoryExtra, TensorSize},
            watch_folder::WatchFolderDTO,
        },
        filters::ListImagesFilter,
    },
};

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn list_projects(
        &self,
        watchfolder_id: Option<i64>,
    ) -> Result<Vec<ProjectExtra>, String> {
        let db = self.get_db().await?;
        db.list_projects(watchfolder_id)
            .await
            .map_err(|e| e.to_string())
    }

    #[dtp_command]
    pub async fn update_project(
        &self,
        project_id: i64,
        exclude: Option<bool>,
    ) -> Result<(), String> {
        todo!()
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
    ) -> Result<ListImagesResult, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn find_image_from_preview_id(
        &self,
        project_id: i64,
        preview_id: i64,
    ) -> Result<Option<crate::projects_db::dtos::image::ImageExtra>, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn get_clip(&self, image_id: i64) -> Result<Vec<TensorHistoryClip>, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn list_watch_folders(&self) -> Result<Vec<WatchFolderDTO>, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn add_watch_folder(&self, path: String) -> Result<WatchFolderDTO, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn remove_watch_folder(&self, id: i64) -> Result<(), String> {
        todo!()
    }

    #[dtp_command]
    pub async fn update_watch_folder(&self, id: i64, exclude: bool) -> Result<(), String> {
        todo!()
    }

    #[dtp_command]
    pub async fn list_models(
        &self,
        model_type: Option<entity::enums::ModelType>,
    ) -> Result<Vec<ModelExtra>, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn get_history_full(
        &self,
        project_id: i64,
        row_id: i64,
    ) -> Result<TensorHistoryExtra, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn get_tensor_size(
        &self,
        project_id: i64,
        tensor_id: String,
    ) -> Result<TensorSize, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn decode_tensor(
        &self,
        project_id: i64,
        node_id: Option<i64>,
        tensor_id: String,
        as_png: bool,
    ) -> Result<tauri::ipc::Response, String> {
        todo!()
    }

    #[dtp_command]
    pub async fn find_predecessor(
        &self,
        project_id: i64,
        row_id: i64,
        lineage: i64,
        logical_time: i64,
    ) -> Result<Vec<TensorHistoryExtra>, String> {
        todo!()
    }
}
