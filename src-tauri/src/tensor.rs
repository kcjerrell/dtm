use anyhow::{anyhow, Result};
use strum::EnumIs;

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

    pub fn to_pixel_data(&self, size: Option<u32>) -> anyhow::Result<Vec<u8>> {
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
                        let mut i = 0usize;
                        while i < out.len().min(src.len()) {
                            out[i] = if src[i] > 0 { 255 } else { 0 };
                            i += 1;
                        }
                    }
                    TensorValue::F32(src) => {
                        let mut i = 0usize;
                        while i < src.len() {
                            let v = src[i];
                            let v = ((v + 1.0) * 0.5 * 255.0).clamp(0.0, 255.0);
                            out[i] = v as u8;
                            i += 1;
                        }
                    }
                }

                return Ok(out);
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

        Ok(out)
    }

    pub fn to_png(
        &self,
        history_node: Option<&TensorHistoryNode>,
        size: Option<u32>,
    ) -> Result<Vec<u8>> {
        let pixels = self.to_pixel_data(size)?;
        let (width, height) = if let Some(target_size) = size {
            (target_size, target_size)
        } else {
            (self.width, self.height)
        };
        let channels = self.channels;

        let metadata = history_node.map(|n| n.node_data());

        let png = write_png_with_usercomment(&pixels, width, height, channels as usize, metadata)?;

        Ok(png)
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

        let tensor = if tensor_raw.name.starts_with("binary_mask")
            || tensor_raw.name.starts_with("scribble")
            || tensor_raw.name.starts_with("audio")
        {
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
                dtype: dtype,
                data: tensor_data,
            }
        } else {
            let n = (tensor_raw.n as u32).max(1);
            let width = tensor_raw.width as u32;
            let height = tensor_raw.height as u32;
            let channels = (tensor_raw.channels as u32).max(1);

            Tensor {
                n,
                width,
                height,
                channels,
                dtype: dtype,
                data: tensor_data,
            }
        };

        Ok(tensor)
    }
}

fn get_decompressed(tensor: &TensorRaw) -> anyhow::Result<TensorValue> {
    // this is easiest to check. If it's an fpz stream, it will definitely be f32 as well
    if is_fpz_stream(&tensor.data) {
        if let Ok(data) = decompress_fzip(&tensor.data).map_err(|e| anyhow!(e.to_string())) {
            return Ok(TensorValue::F32(data));
        }
    }
    // as far as i know, all tensors are either fpzipped or deflate u8, but that might not be correct.
    // so we'll check the data length first, return if even, and then finally try deflate
    let buffer_len =
        tensor.n.max(1) * tensor.height.max(1) * tensor.width.max(1) * tensor.channels.max(1);

    // buffer must be 4 bytes per element
    if tensor.data.len() == (buffer_len as usize * 4) {
        return Ok(TensorValue::F32(bytes_to_f32(&tensor.data)?));
    }
    // buffer must be 1 byte per element
    else if tensor.data.len() == (buffer_len as usize) {
        return Ok(TensorValue::U8(tensor.data.to_vec()));
    }
    // only option left is deflate
    else {
        Ok(TensorValue::U8(inflate_deflate(&tensor.data)?))
    }
}

fn is_fpz_stream(buf: &[u8]) -> bool {
    // note: "fpy" is not a typo
    matches!(buf.get(..3), Some(b"fpy"))
}

fn bytes_to_f32(bytes: &[u8]) -> anyhow::Result<Vec<f32>> {
    if bytes.len() % std::mem::size_of::<f32>() != 0 {
        anyhow::bail!(
            "Byte array length is not a multiple of {}",
            std::mem::size_of::<f32>()
        );
    }

    bytemuck::try_cast_slice(bytes)
        .map(|slice| slice.to_vec())
        .map_err(|e| anyhow::anyhow!("Failed to convert bytes to f32: {:?}", e))
}
