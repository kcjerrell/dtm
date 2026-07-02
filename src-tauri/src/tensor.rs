use anyhow::{anyhow, Result};

use crate::projects_db::{
    decompress_fzip, dt_project::TensorHistoryNode, dtos::tensor::TensorRaw, inflate_deflate,
    write_png_with_usercomment,
};

/// A decompressed Draw Things tensor.
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
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum TensorDType {
    F32,
    U8,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
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

    pub fn to_pixel_data(&self, scale: Option<i32>) -> Result<Vec<u8>> {
        let data = match self.dtype {
            TensorDType::F32 => {
                let out = self.as_f32().ok_or(anyhow::anyhow!("Tensor is not F32"))?;
                let pixels = if let Some(target_size) = scale {
                    log::debug!("Scaling to {}x{}", target_size, target_size);
                    let width = self.width as usize;
                    let height = self.height as usize;
                    let channels = self.channels as usize;
                    let target_size = target_size as usize;

                    // Calculate center crop
                    let crop_size = width.min(height);
                    let start_x = (width - crop_size) / 2;
                    let start_y = (height - crop_size) / 2;

                    // Calculate sampling step
                    // We want to sample `target_size` pixels from `crop_size`
                    // step = crop_size / target_size
                    let step = crop_size as f32 / target_size as f32;

                    let mut pixels = Vec::with_capacity(target_size * target_size * channels);

                    for y in 0..target_size {
                        for x in 0..target_size {
                            let src_y = start_y + (y as f32 * step) as usize;
                            let src_x = start_x + (x as f32 * step) as usize;

                            if src_y < height && src_x < width {
                                let pixel_idx = (src_y * width + src_x) * channels;
                                for c in 0..channels {
                                    let v = out[pixel_idx + c];
                                    let f = v.clamp(-1.0, 1.0);
                                    pixels.push(((f * 0.5 + 0.5) * 255.0).round() as u8);
                                }
                            } else {
                                // Should not happen with correct math, but safe fallback
                                for _ in 0..channels {
                                    pixels.push(0);
                                }
                            }
                        }
                    }
                    Ok(pixels)
                } else {
                    let mut pixels = vec![0u8; out.len()];
                    for i in 0..out.len() {
                        pixels[i] = ((out[i] * 0.5 + 0.5) * 255.0).round() as u8;
                    }
                    Ok(pixels)
                };
                pixels
            }
            TensorDType::U8 => Err(anyhow::anyhow!("Tensor is not F32")),
        };
        data
    }

    pub fn to_png(
        &self,
        history_node: Option<&TensorHistoryNode>,
        scale: Option<i32>,
    ) -> Result<Vec<u8>> {
        let pixels = self.to_pixel_data(scale)?;
        let (width, height) = if let Some(target_size) = scale {
            (target_size as u32, target_size as u32)
        } else {
            (self.width, self.height)
        };
        let channels = self.channels;

        let metadata = history_node.map(|n| n.node_data());

        let png =
            write_png_with_usercomment(&pixels, width, height, channels as usize, metadata)?;
        
        Ok(png)
    }
}

impl TryFrom<TensorRaw> for Tensor {
    type Error = anyhow::Error;

    fn try_from(tensor: TensorRaw) -> anyhow::Result<Self> {
        let (dtype, data) =
            if tensor.name.starts_with("binary_mask") || tensor.name.starts_with("scribble") {
                (
                    TensorDType::U8,
                    TensorValue::U8(inflate_deflate(&tensor.data)?),
                )
            } else if is_fpz_stream(&tensor.data) {
                (
                    TensorDType::F32,
                    TensorValue::F32(
                        decompress_fzip(&tensor.data).map_err(|e| anyhow!(e.to_string()))?,
                    ),
                )
            } else {
                (
                    TensorDType::F32,
                    TensorValue::F32(bytes_to_f32(tensor.data)?),
                )
            };

        Ok(Self {
            n: tensor.n as u32,
            width: tensor.width as u32,
            height: tensor.height as u32,
            channels: tensor.channels as u32,
            dtype,
            data,
        })
    }
}

fn is_fpz_stream(buf: &[u8]) -> bool {
    matches!(buf.get(..3), Some(b"fpy"))
}

fn bytes_to_f32(bytes: Vec<u8>) -> anyhow::Result<Vec<f32>> {
    if bytes.len() % std::mem::size_of::<f32>() != 0 {
        anyhow::bail!(
            "Byte array length is not a multiple of {}",
            std::mem::size_of::<f32>()
        );
    }

    bytemuck::try_cast_vec(bytes)
        .map_err(|e| anyhow::anyhow!("Failed to convert bytes to f32: {:?}", e))
}
