use crate::{
    projects_db::{dtos::tensor::TensorRaw, ProjectRef},
    ResourceHandle,
};

/// Reference to a `tensordata` row, mirroring the relevant `TdFilter` variants
/// in `dt_project/tensor_data.rs`.
#[derive(Debug, Clone)]
pub enum TensorDataRef {
    Rowid(i64),
    LineageTimeIdx(i64, i64, i64),
}

/// Reference to a `tensorhistorynode` row, mirroring `ThnFilter::Rowid` and
/// `ThnFilter::LineageAndLogicalTime` in `dt_project/tensor_history_node.rs`.
#[derive(Debug, Clone)]
pub enum ThnRef {
    RowId(i64),
    LineageTime(i64, i64),
}

/// The specific resource derived from a tensor history node.
///
/// Indexed variants carry a `u8` index; the remaining variants are singletons.
#[derive(Debug, Clone)]
pub enum ThnResource {
    None,
    Thumb,
    ThumbHalf,
    Canvas(u8),
    Mask(u8),
    Moodboard(u8),
    DepthMap,
    Pose,
    Scribble,
    Custom,
    ColorPalette,
}

/// A reference to a particular resource within a project.
#[derive(Debug, Clone)]
pub enum DtResourceRef {
    Tensor(String),
    TensorData(TensorDataRef),
    Thumb(i64),
    ThumbHalf(i64),
    TensorHistoryNode(ThnRef, ThnResource),
}

/// A backend-agnostic handle to a resource within a project.
///
/// Constructible as a trivial literal, e.g.:
/// ```ignore
/// DtResourceHandle {
///     project: ProjectRef::Id(1),
///     resource: DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), ThnResource::Thumb),
/// }
/// ```
#[derive(Debug, Clone)]
pub struct DtResourceHandle {
    pub project: ProjectRef,
    pub resource: DtResourceRef,
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
