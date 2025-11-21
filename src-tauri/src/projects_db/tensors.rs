use anyhow::Result;
use flate2::read::DeflateDecoder;
use fpzip_sys::*;

use image::{GrayAlphaImage, GrayImage, RgbImage, RgbaImage};
use little_exif::exif_tag::ExifTag;
use little_exif::filetype::FileExtension;
use little_exif::metadata::Metadata;
use little_exif::u8conversion::U8conversion;

use png::chunk::eXIf;
use png::{BitDepth, ColorType, Encoder};

use std::ffi::c_void;
use std::io::Cursor;
use std::io::Read;

use crate::projects_db::build_drawthings_json;
use crate::projects_db::dt_project::TensorRaw;
use crate::projects_db::tensor_history::TensorHistoryNode;

const HEADER_SIZE: usize = 68;
const FPZIP_MAGIC: u32 = 1012247;

pub fn decode_tensor(
    tensor: TensorRaw,
    as_png: bool,
    metadata: Option<TensorHistoryNode>,
    scale: Option<u32>,
) -> Result<Vec<u8>> {
    if tensor.data_type == 16384 {
        return decode_pose(tensor);
    }

    let out = decompress_fzip(tensor.data)?;

    let (pixels, width, height) = if let Some(target_size) = scale {
        let width = tensor.width as usize;
        let height = tensor.height as usize;
        let channels = tensor.channels as usize;
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
        (pixels, target_size as u32, target_size as u32)
    } else {
        // --- Map f16 [-1,1] → u8 [0,255] ---
        let pixels: Vec<u8> = out
            .iter()
            .map(|v| {
                let f = v.clamp(-1.0, 1.0);
                ((f * 0.5 + 0.5) * 255.0).round() as u8
            })
            .collect();
        (pixels, tensor.width as u32, tensor.height as u32)
    };

    match as_png {
        true => Ok(write_png_with_usercomment(
            &pixels,
            width,
            height,
            tensor.channels as usize,
            metadata,
        )
        .unwrap()),
        false => Ok(pixels),
    }
}

// pub fn add_metadata(png: &mut Vec<u8>, data: TensorHistoryNode) -> Result<()> {
//     // let mut metadata = Metadata::new_from_vec(&png, FileExtension::PNG { as_zTXt_chunk: true })?;
//     let mut metadata = Metadata::new();
//     let json = serde_json::to_string_pretty(&data)?;
//     println!("json: {}", json);
//     metadata.set_tag(ExifTag::UserComment(
//         json.to_u8_vec(&little_exif::endian::Endian::Little),
//     ));
//     metadata.write_to_file(
//         png,
//         FileExtension::PNG {
//             as_zTXt_chunk: true,
//         },
//     )?;
//     Ok(())
// }

fn decode_pose(tensor: TensorRaw) -> std::result::Result<Vec<u8>, anyhow::Error> {
    if tensor.data[0] == 0x66 && tensor.data[1] == 0x70 && tensor.data[2] == 0x79 {
        let dec = decompress_fzip(tensor.data);
        Ok(f32_to_u8(dec.unwrap()))
    } else {
        Ok(tensor.data)
    }
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

fn data_to_png(pixels: Vec<u8>, width: i32, height: i32, channels: i32) -> Result<Vec<u8>> {
    let mut out = Vec::new();

    match channels {
        4 => RgbaImage::from_raw(width as u32, height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        3 => RgbImage::from_raw(width as u32, height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        2 => GrayAlphaImage::from_raw(width as u32, height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        1 => GrayImage::from_raw(width as u32, height as u32, pixels)
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
        _ => panic!("Unsupported number of channels: {}", channels),
    }

    Ok(out)
}

fn f32_to_u8(vec: Vec<f32>) -> Vec<u8> {
    let len = vec.len() * std::mem::size_of::<f32>();
    let mut u8_vec = Vec::with_capacity(len);

    for f in vec {
        u8_vec.extend_from_slice(&f.to_le_bytes()); // or to_be_bytes depending on endianness
    }

    u8_vec
}

pub fn write_png_with_usercomment(
    pixels: &[u8],
    width: u32,
    height: u32,
    channels: usize,
    metadata: Option<TensorHistoryNode>,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut out = Vec::new();
    let cursor = Cursor::new(&mut out);

    let mut encoder = Encoder::new(cursor, width, height);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_color(match channels {
        1 => ColorType::Grayscale,
        2 => ColorType::GrayscaleAlpha,
        3 => ColorType::Rgb,
        4 => ColorType::Rgba,
        _ => return Err("Unsupported channel count".into()),
    });

    let mut writer = encoder.write_header()?;

    if let Some(metadata) = metadata {
        let json_string = serde_json::to_string_pretty(&build_drawthings_json(&metadata))?;
        let xmp = build_drawthings_xmp(&json_string);
        let itxt_chunk = build_itxt_chunk("XML:com.adobe.xmp", &xmp);

        writer.write_chunk(png::chunk::iTXt, &itxt_chunk)?;
    }

    writer.write_image_data(pixels)?;
    writer.finish()?;

    Ok(out)
}

fn build_itxt_chunk(keyword: &str, text: &str) -> Vec<u8> {
    let mut out = Vec::new();

    out.extend_from_slice(keyword.as_bytes());
    out.push(0); // null-terminator for keyword
    out.push(0); // compression flag: 0 = uncompressed
    out.push(0); // compression method: must be 0
    out.push(0); // language tag: empty
    out.push(0); // translated keyword: empty

    out.extend_from_slice(text.as_bytes()); // UTF-8 XMP body

    out
}

fn build_drawthings_xmp(json: &str) -> String {
    format!(
        r#"<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
           xmlns:exif="http://ns.adobe.com/exif/1.0/">
    <rdf:Description rdf:about="">
      <exif:UserComment>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">{json}</rdf:li>
        </rdf:Alt>
      </exif:UserComment>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"#
    )
}
