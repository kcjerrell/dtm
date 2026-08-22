use std::{fs::File, sync::Arc};

use anyhow::{Context, Result};
use image::{codecs::jpeg::JpegEncoder, ExtendedColorType};
use s_zip::StreamingZipWriter;
use sqlx::pool::PoolConnection;
use tokio::sync::Mutex;

use crate::{
    dt_project::{split_tensor_name, Clip, ClipFilter, TensorHistoryNode, TensorRaw},
    projects_db::{
        archive::plan::ArchivePlanItem, write_jpeg_with_metadata, DtProjectRef, DtResourceHandle,
        DtResourceRef, ThnRef, ThnResource,
    },
    tensor::TensorKind,
    ResourceHandle, Tensor,
};

#[derive(Debug)]
pub struct CopyTensorItem {
    pub name: String,
    pub node_id: Option<i64>,
    pub preview_id: Option<i64>,
    pub preview: Option<Vec<u8>>,
    pub primary: bool,
    pub index: i64,
    pub data: Option<Vec<u8>>,
    pub data_ext: Option<String>,
    pub added_to_archive: bool,
    pub result: anyhow::Result<()>,
}

impl CopyTensorItem {
    fn new(tensor_name: String, index: i64) -> Self {
        CopyTensorItem {
            name: tensor_name,
            primary: false,
            index,
            added_to_archive: false,
            node_id: None,
            preview_id: None,
            preview: None,
            data: None,
            data_ext: None,
            result: Ok(()),
        }
    }

    pub fn primary(item: ArchivePlanItem) -> Self {
        CopyTensorItem {
            name: item.name,
            primary: true,
            index: item.index,
            added_to_archive: false,
            node_id: item.node_id,
            preview_id: item.preview_id,
            preview: None,
            data: None,
            data_ext: None,
            result: Ok(()),
        }
    }

    pub fn extra(item: ArchivePlanItem) -> Self {
        CopyTensorItem {
            name: item.name,
            primary: false,
            index: item.index,
            added_to_archive: false,
            node_id: item.node_id,
            preview_id: item.preview_id,
            preview: None,
            data: None,
            data_ext: None,
            result: Ok(()),
        }
    }

    pub fn filename(&self) -> Result<String> {
        let ext = self
            .data_ext
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("file extension not set for item '{}'", self.name))?;
        Ok(format!(
            "{}/{:06}_{}.{}",
            if self.primary { "images" } else { "tensors" },
            self.index,
            self.name,
            ext
        ))
    }

    pub fn preview_filename(&self) -> Option<String> {
        self.preview.as_ref()?;
        self.preview_id
            .map(|preview_id| format!("thumbhalf/{}.jpg", preview_id))
    }

    /// Pipeline stage: Convert
    /// This stage intentionally does not use the DtResourceHandle methods (which are async) so
    /// cpu-bound tasks can run on their own thread
    pub async fn convert(&mut self, project_ref: DtProjectRef, lossless: bool) -> Result<()> {
        let resource = match self.node_id {
            Some(node_id) => DtResourceHandle::new(
                &project_ref,
                &DtResourceRef::TensorHistoryNode(
                    ThnRef::RowId(node_id),
                    ThnResource::Tensor(self.name.clone()),
                ),
            ),
            None => project_ref.tensor(&self.name),
        };

        let node = resource
            .get_history_node()
            .await
            .with_context(|| format!("failed to fetch history node for tensor '{}'", self.name))?
            .cloned();

        let size = if self.name.starts_with("pose") {
            let tds = project_ref
                .get_project()
                .await
                .with_context(|| format!("failed to open project for pose tensor '{}'", self.name))?
                .find_tensordata_by_tensor(&self.name)
                .await
                .with_context(|| format!("failed to find tensordata for pose '{}'", self.name))?;
            let td = tds.first();
            td.map(|t| (t.data().width(), t.data().height()))
        } else {
            None
        };

        let clip = if self.name.starts_with("audio") {
            let (_, id) = split_tensor_name(&self.name)?;
            let clips = project_ref
                .get_project()
                .await
                .with_context(|| {
                    format!("failed to open project for audio tensor '{}'", self.name)
                })?
                .get_clips(ClipFilter::AudioId(id))
                .await
                .with_context(|| {
                    format!("failed to find clips for audio tensor '{}'", self.name)
                })?;
            clips.into_iter().next()
        } else {
            None
        };

        if self.primary {
            if let Some(preview_id) = self.preview_id {
                if let Some(node) = &node {
                    if node.data().index_in_a_clip() == 0 {
                        self.preview = project_ref
                            .thumb(preview_id)
                            .get_preview(true)
                            .await
                            .with_context(|| {
                                format!(
                                    "failed to get preview {preview_id} for tensor '{}'",
                                    self.name
                                )
                            })?;
                    }
                }
            }
        }

        let tensor_raw = resource
            .get_tensor_raw()
            .await
            .with_context(|| format!("failed to get raw tensor data for '{}'", self.name))?;

        if let Some(data) = tensor_raw {
            let name_clone = self.name.clone();
            let result = tokio::task::spawn_blocking(move || {
                let tensor = Tensor::try_from(data)
                    .with_context(|| format!("failed to convert raw tensor '{name_clone}'"))?;
                match tensor.kind {
                    TensorKind::Image | TensorKind::Binary => get_image(lossless, node, tensor),
                    TensorKind::Pose => get_pose(tensor, size),
                    TensorKind::Audio => get_audio(tensor, clip),
                    TensorKind::Unknown => anyhow::bail!("unknown tensor kind for '{name_clone}'"),
                }
            })
            .await
            .with_context(|| {
                format!(
                    "blocking conversion task panicked for tensor '{}'",
                    self.name
                )
            })??;

            self.data = Some(result.0);
            self.data_ext = Some(result.1);
        } else {
            anyhow::bail!("raw tensor not found for '{}'", self.name);
        }

        Ok(())
    }

    /// Pipeline stage: Zip
    pub fn archive(&mut self, writer: &mut StreamingZipWriter<File>) -> Result<()> {
        if let Some(data) = &self.data {
            let filename = self.filename()?;
            writer
                .start_entry(&filename)
                .with_context(|| format!("failed to start zip entry for '{filename}'"))?;
            writer
                .write_data(data)
                .with_context(|| format!("failed to write zip data for '{filename}'"))?;

            if let Some(preview) = &self.preview {
                if let Some(name) = &self.preview_filename() {
                    writer.start_entry(name).with_context(|| {
                        format!("failed to start zip preview entry for '{name}'")
                    })?;
                    writer.write_data(preview).with_context(|| {
                        format!("failed to write zip preview data for '{name}'")
                    })?;
                }
            }

            self.added_to_archive = true;
        }
        Ok(())
    }

    /// Pipeline stage: Db
    pub async fn update_db(
        &mut self,
        db_conn: Arc<Mutex<PoolConnection<sqlx::Sqlite>>>,
    ) -> Result<()> {
        let mut db_conn = db_conn.lock().await;

        let filename = self.filename()?.into_bytes();
        let preview_filename = self
            .preview_filename()
            .map_or(filename.clone(), |pf| pf.into_bytes());
        sqlx::query(
            "INSERT INTO main.tensors ( name, type, format, datatype, dim, data )
                             SELECT name, type, format, datatype, dim, ?1 AS data
                             FROM dtp.tensors WHERE name == ?2",
        )
        .bind(&filename)
        .bind(&self.name)
        .execute(&mut **db_conn)
        .await
        .with_context(|| format!("DbWorker failed to insert tensor record '{}'", self.name))?;

        if let Some(preview_id) = self.preview_id {
            if let Some(node_id) = self.node_id {
                match sqlx::query("INSERT INTO thumbnailhistorynode (rowid, __pk0, p) VALUES (?1, ?2, ?3); INSERT INTO thumbnailhistoryhalfnode (rowid, __pk0, p) VALUES (?1, ?2, ?4);")
                                    .bind(node_id)
                                    .bind(preview_id)
                                    .bind(&filename)
                                    .bind(&preview_filename)
                                    .execute(&mut **db_conn)
                                    .await {
                                        Ok(_) => (),
                                        Err(e) => {
                                            eprintln!("DbWorker failed to insert thumbnail for {}: {}", self.name, e);
                                            return Err(e.into());
                                        }
                                    }
            }
        }
        Ok(())
    }
}

fn get_image(
    lossless: bool,
    node: Option<TensorHistoryNode>,
    tensor: Tensor,
) -> anyhow::Result<(Vec<u8>, String)> {
    if lossless {
        // NOTE: Returns error if tensor is not Image/Binary kind - needs review
        tensor
            .to_png(node.as_ref(), None)?
            .ok_or_else(|| {
                anyhow::anyhow!("Tensor cannot be converted to PNG (not Image/Binary kind)")
            })
            .map(|t| (t, "png".to_string()))
    } else {
        let pixels = tensor.to_pixel_data(None)?.ok_or_else(|| {
            anyhow::anyhow!("Tensor cannot be converted to pixel data (not Image/Binary kind)")
        })?;

        let mut bytes = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut bytes, 80);
        let color_type = match tensor.channels {
            1 => ExtendedColorType::L8,
            3 => ExtendedColorType::Rgb8,
            4 => ExtendedColorType::Rgba8,
            _ => {
                anyhow::bail!("Unsupported number of channels: {}", tensor.channels)
            }
        };

        if tensor.width * tensor.height * tensor.channels != pixels.len() as u32 {
            anyhow::bail!("Tensor dimensions do not match pixel data length");
        }
        encoder.encode(&pixels, tensor.width, tensor.height, color_type)?;

        let jpg = match node {
            Some(node) => write_jpeg_with_metadata(&bytes, &node.node_data())?,
            None => bytes,
        };

        Ok((jpg, "jpg".to_string()))
    }
}

fn get_pose(tensor: Tensor, size: Option<(i32, i32)>) -> anyhow::Result<(Vec<u8>, String)> {
    let (width, height) = size.unwrap_or((1024, 1024));
    tensor
        .get_pose(width, height)?
        .map(|json| (json.into_bytes(), "json".to_string()))
        .ok_or_else(|| anyhow::anyhow!("Tensor does not contain pose data"))
}

fn get_audio(tensor: Tensor, clip: Option<Clip>) -> anyhow::Result<(Vec<u8>, String)> {
    let clip = clip.ok_or(anyhow::anyhow!(
        "Can't process audio without clip information"
    ))?;
    let duration = clip.count as f64 / clip.frames_per_second;
    tensor
        .decode_audio(duration)
        .map(|audio| (audio, "wav".to_string()))
}
