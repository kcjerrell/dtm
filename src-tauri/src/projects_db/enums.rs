use std::sync::Arc;

use serde::Serialize;
use strum::EnumIs;

use crate::projects_db::{
    archive::cache::DTZipCache,
    dt_project::{tensor_data::TdFilter, tensor_history_node::ThnFilter},
    DTProject, DtResourceHandle, ProjectsDb,
};

/// References a Draw Things project database file, either by its id in DTM's ProjectsDb,
/// its file path, its containing archive, or with a direct reference to the DTProject struct.
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
    Db(Arc<DTProject>),
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

impl DtProjectRef {
    pub fn thumb(&self, preview_id: i64) -> DtResourceHandle {
        DtResourceHandle::new(self, &DtResourceRef::Thumb(preview_id))
    }
    pub fn tensor(&self, name: &str) -> DtResourceHandle {
        DtResourceHandle::new(self, &DtResourceRef::Tensor(String::from(name)))
    }
    pub fn node(&self, node: impl Into<ThnRef>) -> DtResourceHandle {
        DtResourceHandle::new(
            self,
            &DtResourceRef::TensorHistoryNode(node.into(), ThnResource::None),
        )
    }

    pub async fn get_project(&self) -> anyhow::Result<Arc<DTProject>> {
        self.get_or_open_project(false, false).await
    }

    pub async fn open_project(&self) -> anyhow::Result<Arc<DTProject>> {
        self.get_or_open_project(true, false).await
    }

    async fn get_or_open_project(
        &self,
        open: bool,
        as_archive: bool,
    ) -> anyhow::Result<Arc<DTProject>> {
        match self {
            DtProjectRef::Id(id) => {
                let pdb = ProjectsDb::get().await?;
                let project_path = pdb
                    .get_project_path(*id)
                    .await
                    .map_err(|e| anyhow::anyhow!(e))?;
                Box::pin(Self::Path(project_path).get_or_open_project(open, as_archive)).await
            }
            DtProjectRef::Path(path) => {
                if path.ends_with(".dtm.zip") {
                    let dt_zip = DTZipCache::get_dt_zip(path).await?;
                    if open {
                        Ok(Arc::new(
                            DTProject::open_archive(dt_zip).await?,
                        ))
                    } else {
                        Ok(DTProject::get_archive(dt_zip).await?)
                    }
                } else if path.ends_with(".sqlite3") {
                    if open {
                        Ok(Arc::new(DTProject::open(path.as_str()).await?))
                    } else {
                        Ok(DTProject::get(path.as_str()).await?)
                    }
                } else {
                    anyhow::bail!("unknown project type")
                }
            }
            DtProjectRef::Db(db) => Ok(db.clone()),
        }
    }
}

/// Reference to one or more `tensordata` rows, mirroring the relevant `TdFilter` variants
/// in `dt_project/tensor_data.rs`.
#[derive(Debug, Clone, EnumIs, Serialize)]
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
#[derive(Debug, Clone, EnumIs, Serialize)]
pub enum ThnRef {
    /// references a specific tensorhistorynode row by id
    RowId(i64),
    /// references a specific tensorhistorynode row by lineage/logical_time
    LineageTime(i64, i64),
}

impl From<i64> for ThnRef {
    fn from(value: i64) -> Self {
        ThnRef::RowId(value)
    }
}

impl From<(i64, i64)> for ThnRef {
    fn from(value: (i64, i64)) -> Self {
        ThnRef::LineageTime(value.0, value.1)
    }
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
#[derive(Debug, Clone, EnumIs, Serialize)]
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
#[derive(Debug, Clone, EnumIs, Serialize)]
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

impl DtResourceRef {
    /// returns the tensor_name, if the DtResourceRef contains one
    pub fn get_tensor_name(&self) -> Option<String> {
        match self {
            DtResourceRef::Tensor(name) => Some(name.clone()),
            DtResourceRef::TensorData(_, _) => None,
            DtResourceRef::TensorHistoryNode(_, res) => match res {
                ThnResource::Tensor(name) => Some(name.clone()),
                _ => None,
            },
            DtResourceRef::Thumb(_) => None,
        }
    }
}

pub struct PartialThnDtResourceHandle<'a> {
    project: DtProjectRef,
    node: ThnRef,
    source: &'a DtResourceHandle,
}

impl<'a> TryFrom<&'a DtResourceHandle> for PartialThnDtResourceHandle<'a> {
    type Error = anyhow::Error;

    fn try_from(value: &'a DtResourceHandle) -> Result<Self, Self::Error> {
        if let DtResourceRef::TensorHistoryNode(node, _) = &value.resource {
            return Ok(PartialThnDtResourceHandle {
                project: value.project.clone(),
                node: node.clone(),
                source: value,
            });
        } else {
            return Err(anyhow::anyhow!("Resource is not a tensor history node"));
        }
    }
}

impl<'a> PartialThnDtResourceHandle<'a> {
    pub fn Thumb(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::Thumb),
        )
    }
    pub fn DepthMap(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::DepthMap),
        )
    }
    pub fn Pose(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::Pose),
        )
    }
    pub fn Scribble(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::Scribble),
        )
    }
    pub fn Custom(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::Custom),
        )
    }
    pub fn ColorPalette(self) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(self.node, ThnResource::ColorPalette),
        )
    }
    // pub fn Canvas(usize) Canvas(usize)
    // pub fn Mask(usize) Mask(usize)
    // pub fn Moodboard(usize) Moodboard(usize)
    pub fn tensor(self, tensor_name: &str) -> DtResourceHandle {
        DtResourceHandle::new(
            &self.project,
            &DtResourceRef::TensorHistoryNode(
                self.node,
                ThnResource::Tensor(tensor_name.to_string()),
            ),
        )
    }
}
