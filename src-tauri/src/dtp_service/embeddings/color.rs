use candle_core::{Device, IndexOp, Tensor};

use crate::dtp_service::embeddings::task::EmbeddingGenerator;

pub struct ColorEmbedding {}

fn get_coeff_a(device: &Device) -> anyhow::Result<Tensor> {
    let data: [f32; 9] = [
        0.4122214708,
        0.5363325363,
        0.0514459929,
        0.2119034982,
        0.6806995451,
        0.1073969566,
        0.0883024619,
        0.2817188376,
        0.6299787005,
    ];
    Tensor::from_slice(&data, (3, 3), device).map_err(|e| anyhow::anyhow!(e))
}

fn get_coeff_b(device: &Device) -> anyhow::Result<Tensor> {
    let data: [f32; 9] = [
        0.2104542553,
        0.7936177850,
        -0.0040720468,
        1.9779984951,
        -2.4285922050,
        0.4505937099,
        0.0259040371,
        0.7827717662,
        -0.8086757660,
    ];
    Tensor::from_slice(&data, (3, 3), device).map_err(|e| anyhow::anyhow!(e))
}

impl EmbeddingGenerator for ColorEmbedding {
    fn get_embeddings(&self, data: &[candle_core::Tensor]) -> anyhow::Result<candle_core::Tensor> {
        for chw in data {
            let hwc = chw.permute((1, 2, 0))?;
            let h = hwc.dim(0)?;
            let w = hwc.dim(1)?;
            let flat = hwc.reshape((h * w, 3))?;

            let mask = flat.gt(0.04045)?;
            let t = mask.where_cond(&((&flat + 0.055)? / 1.055)?.powf(2.4)?, &(&flat / 12.92)?)?;

            let coeff_a = get_coeff_a(t.device())?;
            let coeff_b = get_coeff_b(t.device())?;

            let lms = t.matmul(&coeff_a.t()?)?.powf(1.0 / 3.0)?;
            let lab = lms.matmul(&coeff_b.t()?)?;

            // let scale = Tensor::from_slice(&[1.0f32, 0.8, 0.8], (1, 1, 3), tensor.device())?;
            // let bias = Tensor::from_slice(&[0.0f32, 0.5, 0.5], (1, 1, 3), tensor.device())?;

            // let normalized = ((&tensor * &scale)? + &bias)?;

            let l = lab.i((.., 0))?;
            let a = lab.i((.., 1))?;
            let b = lab.i((.., 2))?;

            println!(
                "l: {} - {}",
                l.min_all()?.to_scalar::<f32>()?,
                l.max_all()?.to_scalar::<f32>()?
            );
            println!(
                "a: {} - {}",
                a.min_all()?.to_scalar::<f32>()?,
                a.max_all()?.to_scalar::<f32>()?
            );
            println!(
                "b: {} - {}",
                b.min_all()?.to_scalar::<f32>()?,
                b.max_all()?.to_scalar::<f32>()?
            );

            // let l_bin = (l * 12.0)?.floor()?.clamp(0.0, 11.0)?;
            // let a_bin = (((&a + 0.25)? / 0.5)? * 8.0)?.floor()?.clamp(0.0, 7.0)?;
            // let b_bin = (((&b + 0.25)? / 0.5)? * 8.0)?.floor()?.clamp(0.0, 7.0)?;
        }

        Ok(Tensor::zeros(
            (768, 1),
            candle_core::DType::F32,
            data[0].device(),
        )?)
    }
}
