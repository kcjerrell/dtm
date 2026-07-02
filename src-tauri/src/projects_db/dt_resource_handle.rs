use anyhow::{anyhow, Result};
use std::convert::TryInto;
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::{
    projects_db::{
        dt_project::{TdFilter, TensorData, TensorHistoryNode, ThnData, ThnFilter, TmdFilter},
        dtos::tensor::TensorRaw,
        tensors::decompress_fzip,
        DTProject, DtProjectRef, DtResourceRef, ProjectsDb,
    },
    ResourceHandle, Tensor,
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
    history_node: Arc<OnceCell<Option<TensorHistoryNode>>>,
}

#[async_trait::async_trait]
impl ResourceHandle for DtResourceHandle {
    async fn get_tensor(&self) -> Result<Option<Tensor>> {
        if self.resource.is_thumb() {
            return Ok(None);
        }

        if let Some(name) = self.get_tensor_name().await? {
            let dtp = self.get_project().await?;
            let tensor_raw = dtp.get_tensor_raw(&name).await?;
            let tensor: Tensor = tensor_raw.try_into()?;
            return Ok(Some(tensor));
        }

        Ok(None)
    }

    async fn get_lossless(&self) -> Result<Option<Vec<u8>>> {
        if let Some(tensor) = self.get_tensor().await? {
            let history_node = self.get_history_node().await?;
            let png = tensor.to_png(history_node, None)?;
            Ok(Some(png))
        } else {
            Ok(None)
        }
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
        return Err(anyhow::anyhow!("Audio not yet implemented"));
    }

    async fn get_frames(&self, preview: bool) -> Result<Option<Vec<Box<dyn ResourceHandle>>>> {
        return Err(anyhow::anyhow!("Frames not yet implemented"));
    }
}

impl DtResourceHandle {
    pub fn new(project: DtProjectRef, resource: DtResourceRef) -> Self {
        Self {
            project,
            resource,
            project_path: Arc::new(OnceCell::new()),
            history_node: Arc::new(OnceCell::new()),
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

    async fn get_history_node(&self) -> Result<Option<&TensorHistoryNode>> {
        let node = self
            .history_node
            .get_or_try_init(|| async {
                let dtp = self.get_project().await?;
                if let Some((filter, thn_data)) = self.get_get_thn_params() {
                    let node = dtp
                        .get_tensor_history_nodes(Some(filter), Some(thn_data))
                        .await?
                        .into_iter()
                        .next();
                    Ok::<_, anyhow::Error>(node)
                } else {
                    Ok::<_, anyhow::Error>(None)
                }
            })
            .await?;

        Ok(node.as_ref())
    }

    fn get_get_thn_params(&self) -> Option<(ThnFilter, ThnData)> {
        match &self.resource {
            DtResourceRef::TensorHistoryNode(thn_ref, thn_resource) => {
                let mut thn_data = ThnData::default();
                match thn_resource {
                    ThnR::Thumb => {}
                    _ => {
                        thn_data = thn_data.and_tensordata().and_moodboard();
                    }
                };
                Some((thn_ref.into(), thn_data))
            }
            _ => None,
        }
    }

    async fn get_tensor_data(&self) -> Result<Option<Arc<[TensorData]>>> {
        match &self.resource {
            DtResourceRef::Thumb(_) => Ok(None),
            DtResourceRef::Tensor(_) => Ok(None),
            DtResourceRef::TensorData(tensor_data_ref, thn_resource) => {
                let dtp = self.get_project().await?;
                let td = dtp.get_tensor_data(tensor_data_ref.into()).await?;
                Ok(Some(td.into()))
            }
            DtResourceRef::TensorHistoryNode(thn_ref, thn_resource) => Ok(self
                .get_history_node()
                .await?
                .and_then(|n| n.tensordata.clone())),
        }
    }

    async fn get_tensor_name(&self) -> Result<Option<String>> {
        // thumbs do not have a tensor name
        if self.resource.is_thumb() {
            return Ok(None);
        }

        // return the tensor name if it's a tensor
        if let RR::Tensor(name) = &self.resource {
            return Ok(Some(name.clone()));
        }

        // get the resource type
        let res = match &self.resource {
            RR::TensorData(_, res) => res,
            RR::TensorHistoryNode(_, res) => res,
            RR::Thumb(_) | RR::Tensor(_) => panic!("impossible code path"),
        };

        let dtp = self.get_project().await?;

        // handle moodboard case
        if self.resource.is_tensor_history_node() && res.is_moodboard() {
            if let Some(history_node) = self.get_history_node().await? {
                let moodboard_data = dtp
                    .get_tensor_moodboard_data(TmdFilter::LineageTime(
                        history_node.lineage,
                        history_node.logical_time,
                    ))
                    .await?;

                if let ThnR::Moodboard(idx) = res {
                    return Ok(moodboard_data
                        .iter()
                        .find(|mbd| mbd.idx == *idx as i64)
                        .map(|mbd| mbd.tensor_name.clone()));
                }
            }
        }

        // resolve to a list of tensordata
        let tensordata = self.get_tensor_data().await?;
        if tensordata.is_none() {
            return Ok(None);
        }
        let tensordata = tensordata.unwrap();

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
            // tensordata can't reference moodboard...
            ThnR::Moodboard(index) => Ok(None),
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
