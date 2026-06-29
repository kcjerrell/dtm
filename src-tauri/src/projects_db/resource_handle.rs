//! Unified resource handle API.
//!
//! Defines a backend-agnostic way to reference a resource within a project
//! (a tensor, a thumbnail, a tensor-history-node-derived image, etc.) and a
//! trait for resolving those references into concrete bytes/tensors.
//!
//! The trait deliberately keeps DB-specific types (`DTProject`, `sqlx`,
//! `ProjectsDb`) out of its method signatures so that a future
//! `DtmArchiveResource` implementation can satisfy the same contract.

use crate::projects_db::{dtos::tensor::TensorRaw, ProjectRef};

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

/// Resolves a resource handle into concrete bytes/tensors.
///
/// All methods return `Result<Option<T>, String>`: `Ok(None)` means the
/// resource does not exist / is not applicable for this handle, while `Err`
/// signals a resolution failure. `String` is used as the error type to keep
/// DB-specific error types (e.g. `sqlx::Error`) out of the trait surface so
/// non-DB backends can implement it too.
#[async_trait::async_trait]
pub trait ResourceHandle {
    /// Decompressed tensor + header.
    async fn get_tensor(&self) -> Result<Option<TensorRaw>, String>;

    /// PNG bytes from the highest-quality source available.
    async fn get_lossless(&self) -> Result<Option<Vec<u8>>, String>;

    /// Preview-quality image bytes.
    async fn get_preview(&self) -> Result<Option<Vec<u8>>, String>;

    /// Audio bytes.
    ///
    /// Audio extraction needs a clip duration. We take it as a method parameter
    /// (`duration: Option<f64>`) rather than baking it into `ThnResource`/the
    /// ref enums, since duration is a property of the requested rendering rather
    /// than of the resource's identity, and this keeps the ref enums purely
    /// about *what* resource is being referenced.
    async fn get_audio(&self, duration: Option<f64>) -> Result<Option<Vec<u8>>, String>;

    /// Frames (e.g. for clip/video resources), as further resource handles.
    async fn get_frames(&self) -> Result<Option<Vec<DtResourceHandle>>, String>;
}

#[async_trait::async_trait]
impl ResourceHandle for DtResourceHandle {
    async fn get_tensor(&self) -> Result<Option<TensorRaw>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_lossless(&self) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_preview(&self) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_audio(&self, duration: Option<f64>) -> Result<Option<Vec<u8>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_frames(&self) -> Result<Option<Vec<DtResourceHandle>>, String> {
        // TODO(plan 2/3)
        Ok(None)
    }
}
