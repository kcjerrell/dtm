#[derive(Debug, Clone)]
pub enum DtProjectRef {
    Id(i64),
    Path(String),
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
