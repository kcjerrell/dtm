use anyhow::{anyhow, Result};
use serde_json::json;
use strum::EnumIs;

use crate::projects_db::{
    decompress_fzip,
    dt_project::{DTResource, TensorHistoryNode},
    dtos::tensor::TensorRaw,
    inflate_deflate, write_png_with_usercomment,
};

/// A decompressed Draw Things tensor, as stored in a Draw Things project.
/// Includes images, audio, pose, and binary images/masks.
///
/// Tensors are stored in NHWC (batch, height, width, channels) order.
///
/// Data types:
/// - Images use `f32` values in the range `[-1, 1]`.
/// - Depth maps are single-channel `f32` images.
/// - Poses use `f32`. `N` is the number of people, `width` is always 18,
///   `height` is always 2. The data is a sequence of `(x, y)` pairs (18 per
///   person) with values in `[0, 1]`; missing points are `(-1, -1)`.
/// - Masks and scribbles use `u8`.
#[derive(serde::Serialize, Debug, Clone)]
pub struct Tensor {
    /// Number of frames (batch size).
    pub n: u32,

    /// Tensor width.
    pub width: u32,

    /// Tensor height.
    pub height: u32,

    /// Number of channels.
    pub channels: u32,

    /// Element type.
    pub dtype: TensorDType,

    /// Tensor values.
    pub data: TensorValue,

    /// Tensor kind
    pub kind: TensorKind,
}

#[derive(Debug, Clone, serde::Serialize, EnumIs)]
pub enum TensorKind {
    Image,
    Pose,
    Audio,
    Binary,
    Unknown,
}

impl TensorKind {
    pub fn from_name(name: &str) -> TensorKind {
        match name.split_once('_') {
            Some((prefix, _)) => match prefix {
                "tensor" | "shuffle" | "custom" | "depth" | "color" => TensorKind::Image,
                "pose" => TensorKind::Pose,
                "audio" => TensorKind::Audio,
                "binary" | "scribble" => TensorKind::Binary,
                _ => TensorKind::Unknown,
            },
            None => TensorKind::Unknown,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq, EnumIs)]
pub enum TensorDType {
    F32,
    U8,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, EnumIs)]
pub enum TensorValue {
    F32(Vec<f32>),
    U8(Vec<u8>),
}

impl Tensor {
    pub fn as_f32(&self) -> Option<&[f32]> {
        match &self.data {
            TensorValue::F32(data) => Some(data),
            TensorValue::U8(_) => None,
        }
    }

    pub fn as_u8(&self) -> Option<&[u8]> {
        match &self.data {
            TensorValue::U8(data) => Some(data),
            TensorValue::F32(_) => None,
        }
    }

    pub fn to_pixel_data(&self, size: Option<u32>) -> anyhow::Result<Option<Vec<u8>>> {
        if !self.kind.is_image() && !self.kind.is_binary() {
            return Ok(None);
        }
        let w = self.width as usize;
        let h = self.height as usize;
        let c = self.channels as usize;

        let size = match size {
            Some(s) => s as usize,
            None => {
                // full-res fast path
                let mut out = vec![0u8; w * h * c];

                match &self.data {
                    TensorValue::U8(src) => {
                        if out.len() != src.len() {
                            return Err(anyhow::anyhow!(
                                "Tensor data length mismatch: expected {}, got {}",
                                out.len(),
                                src.len()
                            ));
                        }
                        let mut i = 0usize;
                        while i < out.len().min(src.len()) {
                            out[i] = if src[i] > 0 { 255 } else { 0 };
                            i += 1;
                        }
                    }
                    TensorValue::F32(src) => {
                        if out.len() != src.len() {
                            return Err(anyhow::anyhow!(
                                "Tensor data length mismatch: expected {}, got {}",
                                out.len(),
                                src.len()
                            ));
                        }
                        let mut i = 0usize;
                        while i < src.len() {
                            let v = src[i];
                            let v = ((v + 1.0) * 0.5 * 255.0).clamp(0.0, 255.0);
                            out[i] = v as u8;
                            i += 1;
                        }
                    }
                }

                return Ok(Some(out));
            }
        };

        let side = w.min(h);
        let x0 = (w - side) / 2;
        let y0 = (h - side) / 2;

        let mut out = vec![0u8; size * size * c];

        match &self.data {
            TensorValue::U8(src) => {
                let src_ptr = src.as_ptr();

                for oy in 0..size {
                    let sy = (oy * side) / size + y0;
                    let row_base_out = oy * size * c;

                    for ox in 0..size {
                        let sx = (ox * side) / size + x0;

                        let src_base = (sy * w + sx) * c;
                        let dst_base = row_base_out + ox * c;

                        unsafe {
                            std::ptr::copy_nonoverlapping(
                                src_ptr.add(src_base),
                                out.as_mut_ptr().add(dst_base),
                                c,
                            );
                        }

                        // threshold in-place (small loop, still cheap)
                        let dst_slice = &mut out[dst_base..dst_base + c];
                        for v in dst_slice {
                            *v = if *v > 0 { 255 } else { 0 };
                        }
                    }
                }
            }

            TensorValue::F32(src) => {
                let src_ptr = src.as_ptr();

                for oy in 0..size {
                    let sy = (oy * side) / size + y0;
                    let row_base_out = oy * size * c;

                    for ox in 0..size {
                        let sx = (ox * side) / size + x0;

                        let src_base = (sy * w + sx) * c;
                        let dst_base = row_base_out + ox * c;

                        for ch in 0..c {
                            unsafe {
                                let v = *src_ptr.add(src_base + ch);
                                let v = ((v + 1.0) * 0.5 * 255.0).clamp(0.0, 255.0);
                                *out.get_unchecked_mut(dst_base + ch) = v as u8;
                            }
                        }
                    }
                }
            }
        }

        Ok(Some(out))
    }

    pub fn to_png(
        &self,
        history_node: Option<&TensorHistoryNode>,
        size: Option<u32>,
    ) -> Result<Option<Vec<u8>>> {
        let pixels = match self.to_pixel_data(size)? {
            Some(p) => p,
            None => return Ok(None),
        };
        let (width, height) = if let Some(target_size) = size {
            (target_size, target_size)
        } else {
            (self.width, self.height)
        };
        let channels = self.channels;

        let metadata = history_node.map(|n| n.node_data());

        let png = write_png_with_usercomment(&pixels, width, height, channels as usize, metadata)?;

        Ok(Some(png))
    }

    pub fn get_pose(&self, width: i32, height: i32) -> Result<Option<String>> {
        if !self.kind.is_pose() {
            return Ok(None);
        }

        let points = self
            .as_f32()
            .ok_or_else(|| anyhow::anyhow!("Tensor data is not f32"))?;

        // Convert (x, y) pairs to (x, y, confidence) format
        // Each person has 18 keypoints (36 values) -> 54 values with confidence
        let mut pose_data: Vec<f32> = Vec::new();

        for chunk in points.chunks_exact(36) {
            for point in chunk.chunks_exact(2) {
                let x = point[0];
                let y = point[1];

                if x < 0.0 && y < 0.0 {
                    // Missing point
                    pose_data.extend_from_slice(&[0.0, 0.0, 0.0]);
                } else {
                    // Valid point - scale to image dimensions
                    pose_data.extend_from_slice(&[x * width as f32, y * height as f32, 1.0]);
                }
            }
        }

        let persons: Vec<_> = pose_data
            .chunks_exact(54)
            .map(|p| {
                json!({
                    "pose_keypoints_2d": p
                })
            })
            .collect();

        let result = json!({
            "people": persons,
            "width": width,
            "height": height
        });

        Ok(Some(result.to_string()))
    }
}

impl TryFrom<TensorRaw> for Tensor {
    type Error = anyhow::Error;

    fn try_from(tensor_raw: TensorRaw) -> anyhow::Result<Tensor, anyhow::Error> {
        let tensor_data = get_decompressed(&tensor_raw)?;
        let dtype = if tensor_data.is_f_32() {
            TensorDType::F32
        } else {
            TensorDType::U8
        };
        let kind = TensorKind::from_name(&tensor_raw.name);

        let tensor = match kind {
            TensorKind::Binary | TensorKind::Audio => {
                // these tensor types are handled differently by draw things
                // with the first 8 bytes of the dim blob as height and width
                // rather than the first 16 bytes as NHWC as with the image tensors
                let n = 1;
                let channels = 1;
                let height = tensor_raw.n as u32;
                let width = tensor_raw.height as u32;

                Tensor {
                    n,
                    width,
                    height,
                    channels,
                    dtype,
                    data: tensor_data,
                    kind,
                }
            }
            _ => {
                let n = (tensor_raw.n as u32).max(1);
                let width = tensor_raw.width as u32;
                let height = tensor_raw.height as u32;
                let channels = (tensor_raw.channels as u32).max(1);

                Tensor {
                    n,
                    width,
                    height,
                    channels,
                    dtype,
                    data: tensor_data,
                    kind,
                }
            }
        };

        Ok(tensor)
    }
}

fn get_decompressed(tensor: &TensorRaw) -> anyhow::Result<TensorValue> {
    // Extract bytes from DTResource
    let data = match &tensor.resource {
        DTResource::CompressedTensor(compressed) => compressed.data().to_vec(),
        DTResource::Unknown(bytes) => bytes.clone(),
        DTResource::DTZipRef(_) => {
            return Err(anyhow::anyhow!(
                "DTZipRef not yet supported in get_decompressed - archive tensor reading not implemented"
            ))
        }
        DTResource::JpgInFbs(_) => {
            return Err(anyhow::anyhow!(
                "JpgWithHeader not supported in tensor decompression"
            ))
        }
    };

    // this is easiest to check. If it's an fpz stream, it will definitely be f32 as well
    if is_fpz_stream(&data) {
        if let Ok(decompressed) = decompress_fzip(&data).map_err(|e| anyhow!(e.to_string())) {
            return Ok(TensorValue::F32(decompressed));
        }
    }
    // as far as i know, all tensors are either fpzipped or deflate u8, but that might not be correct.
    // so we'll check the data length first, return if even, and then finally try deflate
    let buffer_len =
        tensor.n.max(1) * tensor.height.max(1) * tensor.width.max(1) * tensor.channels.max(1);

    // buffer must be 4 bytes per element
    if data.len() == (buffer_len as usize * 4) {
        Ok(TensorValue::F32(bytes_to_f32(&data)?))
    }
    // buffer must be 1 byte per element
    else if data.len() == (buffer_len as usize) {
        Ok(TensorValue::U8(data))
    }
    // only option left is deflate
    else {
        Ok(TensorValue::U8(inflate_deflate(&data)?))
    }
}

fn is_fpz_stream(buf: &[u8]) -> bool {
    // note: "fpy" is not a typo
    matches!(buf.get(..3), Some(b"fpy"))
}

fn bytes_to_f32(bytes: &[u8]) -> anyhow::Result<Vec<f32>> {
    if !bytes.len().is_multiple_of(std::mem::size_of::<f32>()) {
        anyhow::bail!(
            "Byte array length is not a multiple of {}",
            std::mem::size_of::<f32>()
        );
    }

    bytemuck::try_cast_slice(bytes)
        .map(|slice| slice.to_vec())
        .map_err(|e| anyhow::anyhow!("Failed to convert bytes to f32: {:?}", e))
}
