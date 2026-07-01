use std::sync::Arc;

use strum::EnumIs;

use crate::projects_db::{
    dt_project::{tensor_data::TdFilter, tensor_history_node::ThnFilter},
    DTProject,
};

#[derive(Debug, Clone, EnumIs)]
pub enum DtProjectRef {
    // references a Draw Things project using its ID in DTM's ProjectsDb
    Id(i64),
    // references a Draw Thing project by absolute file path
    Path(String),
    // direct reference to a Draw Things project database. Only use with DTProject.open()
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

/// Reference to a `tensordata` row, mirroring the relevant `TdFilter` variants
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

/// Reference to a `tensorhistorynode` row, mirroring `ThnFilter::Rowid` and
/// `ThnFilter::LineageAndLogicalTime` in `dt_project/tensor_history_node.rs`.
#[derive(Debug, Clone, EnumIs)]
pub enum ThnRef {
    RowId(i64),
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

/// The specific resource derived from a tensor history node.
///
/// Indexed variants carry a `u8` index; the remaining variants are singletons.
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
}

impl ThnResource {
    /// returns the prefix of this resource's tensor name, or "invalid_" if the resource type 
    /// is not tensor type
    pub fn prefix(&self) -> &str {
        match self {
            ThnResource::None => "invalid_",
            ThnResource::Thumb => "invalid_",
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

/// A reference to a particular resource within a project.
#[derive(Debug, Clone, EnumIs)]
pub enum DtResourceRef {
    Tensor(String),
    Thumb(i64),
    TensorData(TdRef, ThnResource),
    TensorHistoryNode(ThnRef, ThnResource),
}
