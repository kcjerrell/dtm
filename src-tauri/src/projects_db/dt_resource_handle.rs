use std::sync::Arc;

use tokio::sync::OnceCell;

use crate::{
    projects_db::{
        dt_project::TensorHistoryNode, dtos::tensor::TensorRaw, DtProjectRef, DtResourceRef,
    },
    ResourceHandle,
};

/// Handle to a resource in a Draw Things project
#[derive(Debug, Clone)]
pub struct DtResourceHandle {
    pub project: DtProjectRef,
    pub resource: DtResourceRef,

    tensor_history_node: Arc<OnceCell<Option<TensorHistoryNode>>>,
}

#[async_trait::async_trait]
impl ResourceHandle for DtResourceHandle {
    async fn get_tensor(&self) -> Result<Option<Vec<f32>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_lossless(&self) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_preview(&self, half: bool) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_audio(&self) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_frames(
        &self,
        preview: bool,
    ) -> Result<Option<Vec<Box<dyn ResourceHandle>>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }
}

impl DtResourceHandle {
    pub fn new(project: DtProjectRef, resource: DtResourceRef) -> Self {
        Self {
            project,
            resource,
            tensor_history_node: Arc::new(OnceCell::new()),
        }
    }
}
