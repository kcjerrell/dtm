use anyhow::Result;
use std::convert::TryInto;
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::{
    projects_db::{
        decode_audio,
        dt_project::{
            resource::DTResource, TensorData, TensorHistoryNode, ThnData, ThnFilter, TmdFilter,
        },
        dtos::tensor::TensorRaw,
        enums::PartialThnDtResourceHandle,
        DTProject, DtProjectRef, DtResourceRef, ProjectsDb,
    },
    ResourceHandle, Tensor,
};

type RR = DtResourceRef;
type ThnR = super::ThnResource;

/// Handle to a resource in a Draw Things project
#[derive(Debug, Clone)]
pub struct DtResourceHandle {
    pub project: DtProjectRef,
    pub resource: DtResourceRef,

    history_node: Arc<OnceCell<Option<TensorHistoryNode>>>,
}

#[async_trait::async_trait]
impl ResourceHandle for DtResourceHandle {
    async fn get_tensor(&self) -> Result<Option<Tensor>> {
        if self.resource.is_thumb() {
            return Ok(None);
        }

        let dtp = self.get_project().await?;
        if let Some(name) = self.get_tensor_name(Some(&dtp)).await? {
            let tensor_raw = dtp.get_tensor_raw(&name).await?;
            let tensor: Tensor = tensor_raw.try_into()?;

            return Ok(Some(tensor));
        }

        Ok(None)
    }

    async fn get_lossless(&self, size: Option<u32>) -> Result<Option<Vec<u8>>> {
        let dtp = self.get_project().await?;
        let name = self.get_tensor_name(Some(&dtp)).await?;
        if let Some(name) = name {
            if let Ok(tensor_raw) = dtp.get_tensor_raw(&name).await {
                match &tensor_raw.resource {
                    DTResource::CompressedTensor(_) => {
                        let node = self.get_history_node().await?;
                        let tensor: Tensor = Tensor::try_from(tensor_raw)?;
                        return tensor.to_png(node, size);
                    }
                    DTResource::JpgInFbs(_jpg_with_header) => return Ok(None),
                    DTResource::DTZipRef(dtzip_ref) => {
                        return Ok(Some(
                            dtp.dt_zip
                                .as_ref()
                                .map(|dtz| dtz.get_file(&dtzip_ref.rel_path))
                                .ok_or(anyhow::anyhow!("impossible missing dtzip"))?
                                .await?,
                        ))
                    }
                    DTResource::Unknown(_items) => return Ok(None),
                }
            }
        }
        Ok(None)
    }

    async fn get_preview(&self, half: bool) -> Result<Option<Vec<u8>>> {
        let preview_id = match &self.resource {
            RR::Thumb(id) => Some(*id),
            RR::TensorHistoryNode(_, _thn_resource) => {
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
            match thumb {
                DTResource::JpgInFbs(jpg) => Ok(jpg.jpg()),
                DTResource::CompressedTensor(_) => anyhow::bail!("Impossible"),
                DTResource::DTZipRef(dtzip_ref) => Ok(Some(
                    dtp.dt_zip
                        .as_ref()
                        .map(|dtz| dtz.get_file(&dtzip_ref.rel_path))
                        .ok_or(anyhow::anyhow!("impossible missing dtzip"))?
                        .await?,
                )),
                DTResource::Unknown(_items) => Ok(None),
            }
        } else {
            Ok(None)
        }
    }

    async fn get_audio(&self) -> Result<Option<Vec<u8>>> {
        if let Some(node) = self.get_history_node().await? {
            if let Some(clip) = &node.clip {
                if clip.audio_id <= 0 {
                    return Ok(None);
                }
                let audio_id = format!("audio_{}", clip.audio_id);
                let dtp = self.get_project().await?;
                let tensor_raw = dtp.get_tensor_raw(&audio_id).await?;
                // to determine the sample rate we need the duration of the clip
                let duration = clip.count as f64 / clip.frames_per_second;
                let audio = decode_audio(tensor_raw, duration)
                    .await
                    .map_err(|e| anyhow::anyhow!(e))?;
                return Ok(Some(audio));
            }
        }
        Ok(None)
    }

    async fn get_frames(&self, _preview: bool) -> Result<Option<Vec<Box<dyn ResourceHandle>>>> {
        return Err(anyhow::anyhow!("Frames not yet implemented"));
    }
}

impl DtResourceHandle {
    pub fn new(project: &DtProjectRef, resource: &DtResourceRef) -> Self {
        Self {
            project: project.clone(),
            resource: resource.clone(),
            history_node: Arc::new(OnceCell::new()),
        }
    }

    async fn get_project(&self) -> Result<Arc<DTProject>> {
        self.project.get_project().await
    }

    pub async fn get_history_node(&self) -> Result<Option<&TensorHistoryNode>> {
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
                    // for thumb lookup, all we need is the node itself
                    ThnR::Thumb => {}
                    // we do not need tensordata, since Tensor has its own tensor_name included
                    ThnR::Tensor(_) => {}
                    _ => {
                        thn_data = thn_data.and_tensordata().and_moodboard().and_clip();
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
            DtResourceRef::TensorData(tensor_data_ref, _thn_resource) => {
                let dtp = self.get_project().await?;
                let td = dtp.get_tensor_data(tensor_data_ref.into()).await?;
                Ok(Some(td.into()))
            }
            DtResourceRef::TensorHistoryNode(_thn_ref, _thn_resource) => Ok(self
                .get_history_node()
                .await?
                .and_then(|n| n.tensordata.clone())),
        }
    }

    pub async fn get_tensor_raw(&self) -> Result<Option<TensorRaw>> {
        let dtp = self.get_project().await?;
        if let Some(name) = self.get_tensor_name(Some(&dtp)).await? {
            let tensor_raw = dtp.get_tensor_raw(&name).await?;

            return Ok(Some(tensor_raw));
        }

        Ok(None)
    }

    async fn get_tensor_name(&self, project: Option<&DTProject>) -> Result<Option<String>> {
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

        // Handle ThnResource::Tensor by returning the tensor name directly
        if let ThnR::Tensor(name) = res {
            return Ok(Some(name.clone()));
        }

        let dtp = match project {
            Some(project) => project,
            None => &*self.get_project().await?,
        };

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
            ThnR::None => Ok(None),
            // thumb has no tensor name
            ThnR::Thumb => Ok(None),
            // these are canvas images, indexed in reverse order so that 0 is always the top
            ThnR::Canvas(index) => {
                let td = tensordata
                    .iter()
                    .rev()
                    .filter(|tdd| tdd.data().tensor_id() > 0)
                    .nth(*index);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().tensor_id())))
            }
            ThnR::Mask(index) => {
                let td = tensordata
                    .iter()
                    .rev()
                    .filter(|tdd| tdd.data().mask_id() > 0)
                    .nth(*index);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().mask_id())))
            }
            // tensordata can't reference moodboard...
            ThnR::Moodboard(_index) => Ok(None),
            ThnR::DepthMap => {
                let td = tensordata.iter().rfind(|tdd| tdd.data().depth_map_id() > 0);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().depth_map_id())))
            }
            ThnR::Pose => {
                let td = tensordata.iter().rfind(|tdd| tdd.data().pose_id() > 0);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().pose_id())))
            }
            ThnR::Scribble => {
                let td = tensordata.iter().rfind(|tdd| tdd.data().scribble_id() > 0);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().scribble_id())))
            }
            ThnR::Custom => {
                let td = tensordata.iter().rfind(|tdd| tdd.data().custom_id() > 0);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().custom_id())))
            }
            ThnR::ColorPalette => {
                let td = tensordata
                    .iter()
                    .rfind(|tdd| tdd.data().color_palette_id() > 0);
                Ok(td.map(|tdd| format!("{}{}", res.prefix(), tdd.data().color_palette_id())))
            }
            ThnR::Tensor(_name) => Err(anyhow::anyhow!(
                "Impossible code path: ThnResource::Tensor should have been handled earlier"
            )),
        }
    }

    pub fn sub(&self) -> Result<PartialThnDtResourceHandle<'_>> {
        PartialThnDtResourceHandle::try_from(self)
    }

    pub async fn from_image_id(image_id: i64) -> Result<Option<Self>> {
        let pdb = ProjectsDb::get().await?;
        pdb.get_image(image_id)
            .await
            .map(|image| Some(DtProjectRef::Id(image.project_id).node(image.node_id)))
            .map_err(|e| anyhow::anyhow!(e))
    }
}
