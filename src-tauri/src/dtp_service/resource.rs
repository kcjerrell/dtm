use dtm_macros::dtp_commands;

use crate::{
    dtp_service::DTPService,
    projects_db::{DtProjectRef, DtResourceHandle, DtResourceRef, ThnRef, ThnResource},
    ResourceHandle,
};

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn get_resource_image(
        &self,
        project_id: i64,
        node_id: Option<i64>,
        tensor_id: Option<String>,
        size: Option<u32>,
    ) -> Result<tauri::ipc::Response, String> {
        let project_ref = DtProjectRef::Id(project_id);
        let resource_ref = match (node_id, tensor_id) {
            (Some(node_id), Some(tensor_id)) => {
                DtResourceRef::TensorHistoryNode(
                    ThnRef::RowId(node_id),
                    ThnResource::Tensor(tensor_id),
                )
            }
            (Some(node_id), None) => {
                DtResourceRef::TensorHistoryNode(ThnRef::RowId(node_id), ThnResource::None)
            }
            (None, Some(tensor_id)) => DtResourceRef::Tensor(tensor_id),
            (None, None) => return Err("Either node_id or tensor_id must be provided".to_string()),
        };

        let handle = DtResourceHandle::new(&project_ref, &resource_ref);
        let data = handle.get_image(size).await.map_err(|e| e.to_string())?;

        match data {
            Some(bytes) => Ok(tauri::ipc::Response::new(bytes)),
            None => Err("No lossless data available".to_string()),
        }
    }

    #[dtp_command]
    pub async fn get_resource_json(
        &self,
        project_id: i64,
        node_id: Option<i64>,
        tensor_id: Option<String>,
    ) -> Result<String, String> {
        let project_ref = DtProjectRef::Id(project_id);
        let resource_ref = match (node_id, tensor_id) {
            (Some(node_id), Some(tensor_id)) => {
                DtResourceRef::TensorHistoryNode(
                    ThnRef::RowId(node_id),
                    ThnResource::Tensor(tensor_id),
                )
            }
            (Some(node_id), None) => {
                DtResourceRef::TensorHistoryNode(ThnRef::RowId(node_id), ThnResource::None)
            }
            (None, Some(tensor_id)) => DtResourceRef::Tensor(tensor_id),
            (None, None) => return Err("Either node_id or tensor_id must be provided".to_string()),
        };

        println!("checking for pose: {:?} {:?}", project_ref, resource_ref);


        let handle = DtResourceHandle::new(&project_ref, &resource_ref);
        let data = handle.get_json().await.map_err(|e| e.to_string())?;

        match data {
            Some(json) => Ok(json),
            None => Err("No JSON data available".to_string()),
        }
    }
}