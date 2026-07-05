use std::sync::Arc;

use strum::EnumIs;

use crate::projects_db::{
    dt_project::{tensor_data::TdFilter, tensor_history_node::ThnFilter},
    DTProject,
};

/// References a Draw Things project database file, either by its id in DTM's ProjectsDb, 
/// its file path, or with a direct reference to the DTProject struct.
/// 
/// Note: The Db variant should only be used with DTProject.open(). Do not use with a DTProject
/// that lives in the cache (DTProject.get())
#[derive(Debug, Clone, EnumIs)]
pub enum DtProjectRef {
    /// references a Draw Things project using its ID in DTM's ProjectsDb
    Id(i64),
    /// references a Draw Thing project by absolute file path
    Path(String),
    /// direct reference to a Draw Things project database. Only use with DTProject.open()
    Db(Arc<DTProject>)
}

impl From<i64> for DtProjectRef {
    fn from(value: i64) -> Self {
        DtProjectRef::Id(value)
    }
}

impl From<String> for DtProjectRef {
    fn from(value: String) -> Self {
        DtProjectRef::Path(value)
    }
}

impl From<&str> for DtProjectRef {
    fn from(value: &str) -> Self {
        DtProjectRef::Path(value.to_string())
    }
}

/// Reference to one or more `tensordata` rows, mirroring the relevant `TdFilter` variants
/// in `dt_project/tensor_data.rs`.
#[derive(Debug, Clone, EnumIs)]
pub enum TdRef {
    /// references a specific tensordata row by id
    RowId(i64),
    /// references a specific tensordata row by lineage/logical_time/idx
    LineageTimeIdx(i64, i64, i64),
    /// references multiple tensordata rows by lineage/logical_time, corresponds to
    /// tensorhistorynode. The actual tensor to be returned will follow the same rules
    /// as a tensorhistorynode
    LineageTime(i64, i64),
}

impl From<&TdRef> for TdFilter {
    fn from(value: &TdRef) -> Self {
        match value {
            TdRef::RowId(rowid) => TdFilter::Rowid(*rowid),
            TdRef::LineageTimeIdx(lineage, logical_time, idx) => {
                TdFilter::LineageTimeIdx(*lineage, *logical_time, *idx)
            }
            TdRef::LineageTime(lineage, logical_time) => {
                TdFilter::LineageTime(*lineage, *logical_time)
            }
        }
    }
}

/// Reference to a `tensorhistorynode` row, mirroring `ThnFilter` variants
#[derive(Debug, Clone, EnumIs)]
pub enum ThnRef {
    /// references a specific tensorhistorynode row by id
    RowId(i64),
    /// references a specific tensorhistorynode row by lineage/logical_time
    LineageTime(i64, i64),
}

impl From<&ThnRef> for ThnFilter {
    fn from(value: &ThnRef) -> Self {
        match value {
            ThnRef::RowId(rowid) => ThnFilter::Rowid(*rowid),
            ThnRef::LineageTime(lineage, logical_time) => {
                ThnFilter::LineageAndLogicalTime(*lineage, *logical_time)
            }
        }
    }
}

/// Represents a specific resource related to a tensor history node or referenced by tensordata.
/// 
/// Note: some combinations are always impossible, for example TensorData will never have a Thumb
#[derive(Debug, Clone, EnumIs)]
pub enum ThnResource {
    None,
    Thumb,
    Canvas(usize),
    Mask(usize),
    Moodboard(usize),
    DepthMap,
    Pose,
    Scribble,
    Custom,
    ColorPalette,
    Tensor(String),
}

impl ThnResource {
    /// returns the prefix of this resource's tensor name, or "invalid_" if the resource type 
    /// is not tensor type
    pub fn prefix(&self) -> &str {
        match self {
            ThnResource::None => "invalid_",
            ThnResource::Thumb => "invalid_",
            ThnResource::Tensor(_) => "invalid_",
            ThnResource::Canvas(_) => "tensor_history_",
            ThnResource::Mask(_) => "binary_mask_",
            ThnResource::Moodboard(_) => "shuffle_",
            ThnResource::DepthMap => "depth_map_",
            ThnResource::Pose => "pose_",
            ThnResource::Scribble => "scribble_",
            ThnResource::Custom => "custom_",
            ThnResource::ColorPalette => "color_palette_",
        }
    }
}

/// A reference to a specific resource within a project.
#[derive(Debug, Clone, EnumIs)]
pub enum DtResourceRef {
    // References a specific tensor by name
    Tensor(String),
    // References a specific thumb by its ids (TensorHistoryNode.preview_id)
    Thumb(i64),
    // References tensors indirectly through TensorData entries that reference it
    TensorData(TdRef, ThnResource),
    // References tensors and thumbs indirectly through a related TensorHistoryNode
    TensorHistoryNode(ThnRef, ThnResource),
}
