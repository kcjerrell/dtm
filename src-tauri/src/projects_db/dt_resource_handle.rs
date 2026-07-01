use anyhow::{anyhow, Result};
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::{
    projects_db::{
        dt_project::{TdFilter, TensorData, TensorHistoryNode, ThnData, ThnFilter},
        dtos::tensor::TensorRaw,
        tensors::decompress_fzip,
        DTProject, DtProjectRef, DtResourceRef, ProjectsDb,
    },
    resource_handle::ImageTensor,
    ResourceHandle,
};

type RR = DtResourceRef;
type ThnR = super::ThnResource;
type TDR = super::TdRef;

/// Handle to a resource in a Draw Things project
#[derive(Debug, Clone)]
pub struct DtResourceHandle {
    pub project: DtProjectRef,
    pub resource: DtResourceRef,

    project_path: Arc<OnceCell<String>>,
}

#[async_trait::async_trait]
impl ResourceHandle for DtResourceHandle {
    async fn get_tensor(&self) -> Result<Option<ImageTensor>> {
        if self.resource.is_thumb() {
            return Ok(None);
        }

        if let Some(name) = self.get_tensor_name().await? {
            let dtp = self.get_project().await?;
            let tensor_raw = dtp.get_tensor_raw(&name).await?;
            let tensor = ImageTensor {
                n: tensor_raw.n,
                width: tensor_raw.width,
                height: tensor_raw.height,
                channels: tensor_raw.channels,
                data: decompress_fzip(&tensor_raw.data).map_err(|e| anyhow::anyhow!(e))?,
            };
            return Ok(Some(tensor));
        }

        Ok(None)
    }

    async fn get_lossless(&self) -> Result<Option<Vec<u8>>> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_preview(&self, half: bool) -> Result<Option<Vec<u8>>> {
        let preview_id = match &self.resource {
            RR::Thumb(id) => Some(*id),
            RR::TensorHistoryNode(_, thn_resource) => {
                let node = self.get_history_node().await?;
                node.map(|n| n.data().preview_id())
            }
            _ => None,
        };
        if let Some(preview_id) = preview_id {
            let dtp = self.get_project().await?;
            let thumb = if half {
                dtp.get_thumb_half(preview_id).await?
            } else {
                dtp.get_thumb(preview_id).await?
            };
            Ok(Some(thumb))
        } else {
            Ok(None)
        }
    }

    async fn get_audio(&self) -> Result<Option<Vec<u8>>> {
        // TODO(plan 2/3)
        Ok(None)
    }

    async fn get_frames(&self, preview: bool) -> Result<Option<Vec<Box<dyn ResourceHandle>>>> {
        // TODO(plan 2/3)
        Ok(None)
    }
}

impl DtResourceHandle {
    pub fn new(project: DtProjectRef, resource: DtResourceRef) -> Self {
        Self {
            project,
            resource,
            project_path: Arc::new(OnceCell::new()),
        }
    }

    async fn get_project(&self) -> Result<Arc<DTProject>> {
        let project_path = self
            .project_path
            .get_or_try_init(|| async {
                let resolved_path = match &self.project {
                    DtProjectRef::Path(path) => String::from(path),
                    DtProjectRef::Id(id) => {
                        let pdb = ProjectsDb::get().await?;
                        let project = pdb.get_project(*id).await.map_err(|e| anyhow::anyhow!(e))?;
                        String::from(project.full_path)
                    }
                    DtProjectRef::Db(db) => db.path.clone(),
                };
                Ok::<String, anyhow::Error>(resolved_path)
            })
            .await?;

        if let DtProjectRef::Db(db) = &self.project {
            return Ok(db.clone());
        }

        Ok(DTProject::get(project_path).await?)
    }

    pub async fn get_history_node(&self) -> Result<Option<TensorHistoryNode>> {
        let dtp = self.get_project().await?;
        let (filter, thn_data) = self.get_get_thn_params();
        let node = dtp
            .get_tensor_history_nodes(filter, thn_data)
            .await?
            .into_iter()
            .next();
        Ok(node)
    }

    fn get_get_thn_params(&self) -> (Option<ThnFilter>, Option<ThnData>) {
        match &self.resource {
            DtResourceRef::TensorHistoryNode(thn_ref, thn_resource) => {
                let mut thn_data = ThnData::default();
                match thn_resource {
                    ThnR::Thumb => {}
                    _ => {
                        thn_data = thn_data.and_tensordata().and_moodboard();
                    }
                };
                (Some(thn_ref.into()), Some(thn_data))
            }
            _ => (None, None),
        }
    }

    pub async fn get_tensor_data(&self) -> Result<Option<Vec<TensorData>>> {
        match &self.resource {
            DtResourceRef::Thumb(_) => Ok(None),
            DtResourceRef::Tensor(_) => Ok(None),
            DtResourceRef::TensorData(tensor_data_ref, thn_resource) => {
                let dtp = self.get_project().await?;
                Ok(Some(dtp.get_tensor_data(tensor_data_ref.into()).await?))
            }
            DtResourceRef::TensorHistoryNode(thn_ref, thn_resource) => {
                Ok(self.get_history_node().await?.and_then(|n| n.tensordata))
            }
        }
    }

    pub async fn get_tensor_name(&self) -> Result<Option<String>> {
        // thumbs do not have a tensor name
        if self.resource.is_thumb() {
            return Ok(None);
        }

        // return the tensor name if it's a tensor
        if let RR::Tensor(name) = &self.resource {
            return Ok(Some(name.clone()));
        }

        let dtp = self.get_project().await?;

        // resolve to a list of tensordata
        let tensordata = self.get_tensor_data().await?;
        if tensordata.is_none() {
            return Ok(None);
        }
        let tensordata = tensordata.unwrap();

        // get the resource type
        let res = match &self.resource {
            RR::TensorData(_, res) => res,
            RR::TensorHistoryNode(_, res) => res,
            RR::Thumb(_) | RR::Tensor(_) => panic!("impossible code path"),
        };

        // return the first (last) tensor name that matches the type
        match &res {
            // I'll figure out how None should be resolved later
            ThnR::None => return Ok(None),
            // thumb has no tensor name
            ThnR::Thumb => return Ok(None),
            // these are canvas images, indexed in reverse order so that 0 is always the top
            ThnR::Canvas(index) => {
                let td = tensordata
                    .iter()
                    .rev()
                    .filter(|tdd| tdd.data().tensor_id() > 0)
                    .nth(*index);
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().tensor_id())));
            }
            ThnR::Mask(index) => {
                let td = tensordata
                    .iter()
                    .rev()
                    .filter(|tdd| tdd.data().mask_id() > 0)
                    .nth(*index);
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().mask_id())));
            }
            ThnR::Moodboard(index) => panic!("Moodboard resources are not yet implemented"),
            ThnR::DepthMap => {
                let td = tensordata
                    .iter()
                    .filter(|tdd| tdd.data().depth_map_id() > 0)
                    .last();
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().depth_map_id())));
            }
            ThnR::Pose => {
                let td = tensordata
                    .iter()
                    .filter(|tdd| tdd.data().pose_id() > 0)
                    .last();
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().pose_id())));
            }
            ThnR::Scribble => {
                let td = tensordata
                    .iter()
                    .filter(|tdd| tdd.data().scribble_id() > 0)
                    .last();
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().scribble_id())));
            }
            ThnR::Custom => {
                let td = tensordata
                    .iter()
                    .filter(|tdd| tdd.data().custom_id() > 0)
                    .last();
                return Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().custom_id())));
            }
            ThnR::ColorPalette => {
                let td = tensordata
                    .iter()
                    .filter(|tdd| tdd.data().color_palette_id() > 0)
                    .last();
                return Ok(
                    td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().color_palette_id()))
                );
            }
        }
    }
}
