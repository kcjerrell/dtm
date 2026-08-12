use anyhow::Result;
use std::convert::TryInto;
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::{
    dt_project::{split_tensor_name, ClipFilter},
    util::Instants,
};
use crate::{
    dt_project::{
        DTResource, TensorData, TensorHistoryNode, TensorRaw, ThnData, ThnFilter, TmdFilter,
    },
    projects_db::{
        enums::PartialThnDtResourceHandle, DTProject, DtProjectRef, DtResourceRef, ProjectsDb,
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

    async fn get_image(&self, size: Option<u32>) -> Result<Option<Vec<u8>>> {
        let instants = Instants::new();
        let dtp = self.get_project().await?;
        println!("got project: {}", instants.record());
        let name = self.get_tensor_name(Some(&dtp)).await?;
        println!("got name: {}", instants.record());
        if let Some(name) = name {
            if let Ok(tensor_raw) = dtp.get_tensor_raw(&name).await {
                println!("got tensor_raw: {}", instants.record());
                match &tensor_raw.resource {
                    DTResource::CompressedTensor(_) => {
                        let node = self.get_history_node().await?;
                        println!("got node: {}", instants.record());
                        let tensor: Tensor = Tensor::try_from(tensor_raw)?;
                        println!("got tensor: {}", instants.record());
                        let png = tensor.to_png(node, size);
                        println!("got png: {}", instants.record());
                        return png;
                    }
                    DTResource::JpgInFbs(_jpg_with_header) => return Ok(None),
                    DTResource::DTZipRef(dtzip_ref) => {
                        println!("got dtzip_ref: {}", instants.record());
                        let data = dtp
                            .dt_zip
                            .as_ref()
                            .map(|dtz| dtz.get_file(&dtzip_ref.rel_path))
                            .ok_or(anyhow::anyhow!("impossible missing dtzip"))?
                            .await?;
                        println!("got data: {}", instants.record());
                        return Ok(Some(data));
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
        let dtp = self.get_project().await?;
        // to get audio we will need a clip
        let clip = match &self.resource {
            DtResourceRef::Tensor(tensor_name) => {
                let (_, id) = split_tensor_name(tensor_name)?;
                dtp.get_clips(ClipFilter::AudioId(id))
                    .await?
                    .into_iter()
                    .next()
            }
            DtResourceRef::TensorHistoryNode(_, _) => {
                self.get_history_node().await?.and_then(|n| n.clip.clone())
            }
            DtResourceRef::Thumb(_) | DtResourceRef::TensorData(_, _) => {
                return Ok(None);
            }
        };

        if let Some(clip) = clip {
            let tensor_name = format!("audio_{}", clip.audio_id);
            let duration = clip.count as f64 / clip.frames_per_second;
            let tensor_raw = dtp.get_tensor_raw(&tensor_name).await?;
            let audio = match tensor_raw.resource {
                DTResource::CompressedTensor(_) => {
                    let tensor = Tensor::try_from(tensor_raw)?;
                    Some(tensor.decode_audio(duration)?)
                }
                DTResource::DTZipRef(dtzip_ref) => {
                    Some(dtp.get_archive_file(&dtzip_ref.rel_path).await?)
                }
                DTResource::JpgInFbs(_) | DTResource::Unknown(_) => None,
            };
            Ok(audio)
        } else {
            Ok(None)
        }
    }

    async fn get_frames(
        &self,
        _preview: bool,
    ) -> Result<Option<Vec<Box<dyn ResourceHandle + Send + Sync>>>> {
        // get_frames only makes sense if this handle is for a history node
        if !self.resource.is_tensor_history_node() {
            return Ok(None);
        }

        let node = self.get_history_node().await?;
        let Some(node) = node else {
            return Ok(None);
        };

        let Some(clip) = &node.clip else {
            return Ok(None);
        };

        let first_rowid = node.rowid;
        let mut frames = Vec::with_capacity(clip.count as usize);

        for idx in 0..clip.count {
            frames.push(Box::new(self.project.node(first_rowid + idx as i64))
                as Box<dyn ResourceHandle + Send + Sync>);
        }

        Ok(Some(frames))
    }

    async fn get_dtm_path(&self) -> Result<Option<String>> {
        let project_id = self.get_project_id().await?;
        let path = match &self.resource {
            DtResourceRef::Tensor(name) => {
                Some(format!("dtm://dtproject/tensor/{}/{}", project_id, name))
            }
            DtResourceRef::Thumb(thumb_id) => {
                Some(format!("dtm://dtproject/thumb/{}/{}", project_id, thumb_id))
            }
            DtResourceRef::TensorData(_td_ref, _thn_resource) => None,
            DtResourceRef::TensorHistoryNode(_, thn_resource) => match thn_resource {
                super::ThnResource::Thumb => {
                    let Some(node) = self.get_history_node().await? else {
                        return Ok(None);
                    };
                    Some(format!(
                        "dtm://dtproject/thumb/{}/{}",
                        project_id,
                        node.data().preview_id()
                    ))
                }
                _ => {
                    let Some(tensor_name) = self.get_tensor_name(None).await? else {
                        return Ok(None);
                    };
                    Some(format!(
                        "dtm://dtproject/tensor/{}/{}",
                        project_id, tensor_name
                    ))
                }
            },
        };
        Ok(path)
    }

    async fn get_json(&self) -> Result<Option<String>> {
        let mut size: Option<(i32, i32)> = None;
        let tensor_name: Option<String> = match &self.resource {
            RR::TensorData(_, _) => None,
            RR::Tensor(name) => {
                if name.starts_with("pose") {
                    Some(name.to_string())
                } else {
                    None
                }
            }
            RR::Thumb(_) => None,
            RR::TensorHistoryNode(_thn_ref, thn_resource) => {
                match thn_resource {
                    ThnR::Pose => {
                        // need to find the pose tensor name
                        let td = self.get_tensor_data().await?.unwrap_or_default();
                        let pose_td = td.iter().find(|tdd| tdd.data().pose_id() > 0);
                        if let Some(pose_td) = pose_td {
                            let data = pose_td.data();
                            size = Some((data.width(), data.height()));
                            Some(format!("pose_{}", data.pose_id()))
                        } else {
                            None
                        }
                    }
                    ThnR::None => {
                        // this should return the history node data. maybe.
                        None
                    }
                    _ => None,
                }
            }
        };
        println!("tensor_name: {:?}", tensor_name);
        if let Some(tensor_name) = tensor_name {
            let dtp = self.get_project().await?;
            let tensor_raw = dtp.get_tensor_raw(&tensor_name).await?;
            let tensor = Tensor::try_from(tensor_raw)?;

            let (width, height) = match size {
                Some((w, h)) => (w, h),
                None => {
                    let td = dtp
                        .find_tensordata_by_tensor(&tensor_name)
                        .await?
                        .into_iter()
                        .next();
                    td.map_or((1024, 1024), |tdd| {
                        (tdd.data().width(), tdd.data().height())
                    })
                }
            };

            tensor.get_pose(width, height)
        } else {
            Ok(None)
        }
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

    async fn get_project_id(&self) -> Result<i64> {
        let path = match &self.project {
            DtProjectRef::Id(id) => {
                return Ok(*id);
            }
            DtProjectRef::Path(path) => path.to_string(),
            DtProjectRef::Db(dtproject) => dtproject.path.to_string(),
        };
        let pdb = ProjectsDb::get().await?;
        let Some(folder) = pdb.get_watch_folder_for_path(&path).await? else {
            anyhow::bail!("can't find folder");
        };
        let Some(remaining_path) = path.strip_prefix(&folder.path) else {
            anyhow::bail!("can't find folder");
        };
        let project = pdb.get_project_by_path(folder.id, remaining_path).await?;
        if let Some(project) = project {
            Ok(project.id)
        } else {
            anyhow::bail!("can't find project");
        }
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

    pub async fn is_image(&self) -> Result<bool> {
        let Some(tensor_name) = self.get_tensor_name(None).await? else {
            return Ok(false);
        };
        Ok(tensor_name.starts_with("tensor_history")
            || tensor_name.starts_with("binary_mask")
            || tensor_name.starts_with("shuffle")
            || tensor_name.starts_with("custom")
            || tensor_name.starts_with("depth_map")
            || tensor_name.starts_with("scribble"))
    }

    pub async fn is_audio(&self) -> Result<bool> {
        let Some(tensor_name) = self.get_tensor_name(None).await? else {
            return Ok(false);
        };
        Ok(tensor_name.starts_with("audio"))
    }

    pub async fn is_pose(&self) -> Result<bool> {
        let Some(tensor_name) = self.get_tensor_name(None).await? else {
            return Ok(false);
        };
        Ok(tensor_name.starts_with("pose"))
    }
}
