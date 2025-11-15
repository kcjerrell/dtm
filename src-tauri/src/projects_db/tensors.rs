use anyhow::Result;
use flate2::read::DeflateDecoder;
use fpzip_sys::*;
use half::f16;
use image::{GrayAlphaImage, GrayImage, RgbImage, RgbaImage};
use std::ffi::c_void;
use std::io::Cursor;
use std::io::Read;

use crate::projects_db::dt_project::TensorRaw;

const HEADER_SIZE: usize = 68;
const FPZIP_MAGIC: u32 = 1012247;

pub fn tensor_to_png_bytes(tensor: TensorRaw) -> Result<Vec<u8>> {
    let pixel_count = tensor.width * tensor.height * tensor.channels;
    let is_compressed = true;

    println!(
        "[DEBUG] height: {}, width: {}, channels: {}, pixel_count: {}, compressed: {}",
        tensor.height, tensor.width, tensor.channels, pixel_count, is_compressed
    );

    // Allocate output buffer as f32
    let mut out = vec![0.0f32; pixel_count as usize];

    unsafe {
        let fpz: *mut FPZ = fpzip_read_from_buffer(tensor.data.as_ptr() as *const c_void);
        if fpz.is_null() {
            anyhow::bail!("Failed to create FPZIP stream (pointer is null)");
        }

        if fpzip_read_header(fpz) == 0 {
            anyhow::bail!("Failed to read FPZIP header");
        }

        let header = fpz.read();
        let total_values = header.nx * header.ny * header.nz * header.nf;

        let n_read = fpzip_read(fpz, out.as_mut_ptr() as *mut c_void);
        fpzip_read_close(fpz);

        if tensor.data.len() != n_read {
            anyhow::bail!(
                "FPZIP read {} bytes, expected {}",
                n_read,
                tensor.data.len()
            );
        }

        // f16data = out.iter().map(|&x| f16::from_f32(x)).collect();
    }

    // --- Map f16 [-1,1] → u8 [0,255] ---
    let pixels: Vec<u8> = out
        .iter()
        .map(|v| {
            let f = v.clamp(-1.0, 1.0);
            ((f * 0.5 + 0.5) * 255.0).round() as u8
        })
        .collect();

    let mut out = Vec::new();

    // --- Build PNG ---
    match tensor.channels {
        4 => RgbaImage::from_raw(tensor.width as u32, tensor.height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        3 => RgbImage::from_raw(tensor.width as u32, tensor.height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        2 => GrayAlphaImage::from_raw(tensor.width as u32, tensor.height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        1 => GrayImage::from_raw(tensor.width as u32, tensor.height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        _ => panic!("Unsupported number of channels: {}", tensor.channels),
    }

    // img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?;
    Ok(out)
}

pub fn decompress_fzip(data: Vec<u8>) -> Result<Vec<f32>> {
    let mut out: Vec<f32>;
    unsafe {
        let fpz: *mut FPZ = fpzip_read_from_buffer(data.as_ptr() as *const c_void);
        if fpz.is_null() {
            anyhow::bail!("Failed to create FPZIP stream (pointer is null)");
        }

        if fpzip_read_header(fpz) == 0 {
            anyhow::bail!("Failed to read FPZIP header");
        }

        let header = fpz.read();
        let total_values = header.nx * header.ny * header.nz * header.nf;

        out = vec![0.0f32; total_values as usize];

        let n_read = fpzip_read(fpz, out.as_mut_ptr() as *mut c_void);
        fpzip_read_close(fpz);

        if data.len() != n_read {
            anyhow::bail!("FPZIP read {} bytes, expected {}", n_read, data.len());
        }
    }

    Ok(out)
}

pub fn scribble_mask_to_png(tensor: TensorRaw) -> Result<Vec<u8>> {
    let data = inflate_deflate(&tensor.data).unwrap();
    let bw = data.iter().map(|&x| if x > 0 { 255 } else { 0 }).collect();

    let height = i32::from_le_bytes(tensor.dim[0..4].try_into().ok().unwrap());
    let width = i32::from_le_bytes(tensor.dim[4..8].try_into().ok().unwrap());

    let mut out = Vec::new();

    GrayImage::from_raw(width as u32, height as u32, bw)
        .unwrap()
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?;

    Ok(out)
}

fn inflate_deflate(data: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut decoder = DeflateDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}
