use anyhow::Result;
use flate2::read::DeflateDecoder;
use fpzip_sys::*;

use image::GrayImage;
use png::{BitDepth, ColorType, Encoder};

use std::ffi::c_void;
use std::io::Cursor;
use std::io::Read;

use crate::projects_db::dt_project::TensorRaw;
use crate::projects_db::metadata::DrawThingsMetadata;
use crate::projects_db::tensor_history::TensorHistoryNode;

// const HEADER_SIZE: usize = 68;
// const FPZIP_MAGIC: u32 = 1012247;

pub fn decode_tensor(
    tensor: TensorRaw,
    as_png: bool,
    history_node: Option<TensorHistoryNode>,
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
        // let pixels: Vec<u8> = out
        //     .iter()
        //     .map(|v| {
        //         let f = v.clamp(-1.0, 1.0);
        //         ((f * 0.5 + 0.5) * 255.0).round() as u8
        //     })
        //     .collect();
        let mut pixels = vec![0u8; out.len()];
        for i in 0..out.len() {
            pixels[i] = ((out[i] * 0.5 + 0.5) * 255.0).round() as u8;
        }
        (pixels, tensor.width as u32, tensor.height as u32)
    };

    match as_png {
        true => Ok(write_png_with_usercomment(
            &pixels,
            width,
            height,
            tensor.channels as usize,
            history_node,
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
            fpzip_read_close(fpz); // Ensure cleanup on error
            anyhow::bail!("Failed to read FPZIP header");
        }

        let header = fpz.read();
        let total_values = header.nx * header.ny * header.nz * header.nf;

        // Check the type from the header (bindgen usually maps C 'type' to 'type_')
        // constants from fpzip.h: FPZIP_TYPE_FLOAT=0, FPZIP_TYPE_DOUBLE=1
        if header.type_ == FPZIP_TYPE_DOUBLE as i32 {
            // Double precision: read as f64 then convert to f32
            let mut out_f64 = vec![0.0f64; total_values as usize];
            let n_read = fpzip_read(fpz, out_f64.as_mut_ptr() as *mut c_void);
            fpzip_read_close(fpz);

            if data.len() != n_read {
                // This check might be tricky because n_read is compressed bytes read?
                // fpzip_read returns "number of compressed bytes read".
                // If it successfully read the whole stream, it should suffice.
                // However, matching exactly data.len() is good practice if we provided the whole buffer.
                // Let's keep the check but note it applies to compressed input consumed.
                if n_read == 0 {
                     anyhow::bail!("FPZIP read failed (0 bytes read)");
                }
            }
             out = out_f64.into_iter().map(|v| v as f32).collect();
        } else {
            // Assume float (FPZIP_TYPE_FLOAT=0)
            out = vec![0.0f32; total_values as usize];
            let n_read = fpzip_read(fpz, out.as_mut_ptr() as *mut c_void);
            fpzip_read_close(fpz);

            if n_read == 0 {
                 anyhow::bail!("FPZIP read failed (0 bytes read)");
            }
        }
    }

    Ok(out)
}

pub fn scribble_mask_to_png(
    tensor: TensorRaw,
    scale: Option<u32>,
    invert: Option<bool>,
) -> Result<Vec<u8>> {
    let data = inflate_deflate(&tensor.data)?;
    let should_invert = invert.unwrap_or(false);
    let bw: Vec<u8> = data
        .iter()
        .map(|&x| if (x > 0) ^ should_invert { 255 } else { 0 })
        .collect();

    let height = i32::from_le_bytes(tensor.dim[0..4].try_into().ok().unwrap()) as u32;
    let width = i32::from_le_bytes(tensor.dim[4..8].try_into().ok().unwrap()) as u32;

    let mut img = GrayImage::from_raw(width, height, bw)
        .ok_or_else(|| anyhow::anyhow!("Failed to create image from raw"))?;

    let mut out = Vec::new();

    if let Some(target_size) = scale {
        let crop_size = width.min(height);
        let start_x = (width - crop_size) / 2;
        let start_y = (height - crop_size) / 2;

        let cropped =
            image::imageops::crop(&mut img, start_x, start_y, crop_size, crop_size).to_image();
        let resized = image::imageops::resize(
            &cropped,
            target_size,
            target_size,
            image::imageops::FilterType::Nearest,
        );

        resized.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?;
    } else {
        img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?;
    }

    Ok(out)
}

fn inflate_deflate(data: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut decoder = DeflateDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

// fn data_to_png(pixels: Vec<u8>, width: i32, height: i32, channels: i32) -> Result<Vec<u8>> {
//     let mut out = Vec::new();
//
//     match channels {
//         4 => RgbaImage::from_raw(width as u32, height as u32, pixels)
//             .unwrap()
//             .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
//         3 => RgbImage::from_raw(width as u32, height as u32, pixels)
//             .unwrap()
//             .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
//         2 => GrayAlphaImage::from_raw(width as u32, height as u32, pixels)
//             .unwrap()
//             .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
//         1 => GrayImage::from_raw(width as u32, height as u32, pixels)
//             .unwrap()
//             .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?,
//         _ => panic!("Unsupported number of channels: {}", channels),
//     }
//
//     Ok(out)
// }

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
    history_node: Option<TensorHistoryNode>,
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

    // Draw Things writes an explicit sRGB intent. DT seems to expect it.
    writer.write_chunk(
        png::chunk::sRGB,
        &[0], // Per spec: 0 = perceptual rendering intent
    )?;

    if let Some(history) = history_node {
        let metadata = DrawThingsMetadata::try_from(&history)?;
        let json_string = serde_json::to_string(&metadata)?;

        let exif = build_exif_user_comment(&json_string, width, height);
        writer.write_chunk(png::chunk::eXIf, &exif)?;

        let xmp = build_drawthings_xmp(&json_string, &build_description(&metadata));
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

fn build_exif_user_comment(_json: &str, width: u32, height: u32) -> Vec<u8> {
    use byteorder::{BigEndian, WriteBytesExt};

    let mut exif = Vec::new();

    // PNG eXIf chunk does NOT have the "Exif\0\0" prefix.
    // It starts directly with the TIFF header.

    // TIFF header (big endian)
    exif.extend_from_slice(b"MM"); // big endian
    exif.write_u16::<BigEndian>(42).unwrap(); // magic
    exif.write_u32::<BigEndian>(8).unwrap(); // IFD0 offset

    // IFD0 with 1 entry
    exif.write_u16::<BigEndian>(1).unwrap(); // entry count

    // Tag: ExifOffset (0x8769) - Points to Exif SubIFD
    exif.write_u16::<BigEndian>(0x8769).unwrap();
    exif.write_u16::<BigEndian>(4).unwrap(); // LONG
    exif.write_u32::<BigEndian>(1).unwrap(); // count
    exif.write_u32::<BigEndian>(26).unwrap(); // offset to SubIFD (8+2+12+4)

    // Next IFD = none
    exif.write_u32::<BigEndian>(0).unwrap();

    // Exif SubIFD at offset 26
    exif.write_u16::<BigEndian>(2).unwrap(); // entry count in SubIFD (Width, Height, UserComment)

    // Tag: ExifImageWidth (0xa002)
    exif.write_u16::<BigEndian>(0xa002).unwrap();
    exif.write_u16::<BigEndian>(4).unwrap(); // LONG
    exif.write_u32::<BigEndian>(1).unwrap(); // count
    exif.write_u32::<BigEndian>(width).unwrap(); // value

    // Tag: ExifImageHeight (0xa003)
    exif.write_u16::<BigEndian>(0xa003).unwrap();
    exif.write_u16::<BigEndian>(4).unwrap(); // LONG
    exif.write_u32::<BigEndian>(1).unwrap(); // count
    exif.write_u32::<BigEndian>(height).unwrap(); // value

    // // Tag: UserComment (0x9286)
    // exif.write_u16::<BigEndian>(0x9286).unwrap();
    // exif.write_u16::<BigEndian>(7).unwrap(); // UNDEFINED
    // exif.write_u32::<BigEndian>((json.len() + 8) as u32).unwrap();
    // exif.write_u32::<BigEndian>(68).unwrap(); // offset to value (26 + 2 + 12*3 + 4)

    // Next SubIFD = none
    exif.write_u32::<BigEndian>(0).unwrap();

    // // UserComment encoding prefix at offset 68
    // exif.extend_from_slice(b"ASCII\0\0\0");
    // exif.extend_from_slice(json.as_bytes());

    exif
}

fn format_desc_float(f: f64) -> String {
    // Draw Things seems to use f32-like stringification for the description,
    // and always includes .0 for whole numbers.
    let s = format!("{}", f as f32);
    if !s.contains('.') {
        format!("{}.0", s)
    } else {
        s
    }
}

fn build_description(metadata: &DrawThingsMetadata) -> String {
    /*
        this image has awesome metadata. it is a picture of a cool sexy dude
    -and a negative prompt
    Steps: 8, Sampler: UniPC Trailing, Guidance Scale: 1.0, Seed: 3665757974, Size: 1024x1024, Model: z_image_turbo_1.0_q6p.ckpt, Strength: 1.0, Seed Mode: Scale Alike, Shift: 3.0
         */

    format!(
"{}
-{}
Steps: {}, Sampler: {}, Guidance Scale: {}, Seed: {}, Size: {}, Model: {}, Strength: {}, Seed Mode: {}, Shift: {}",
            metadata.c,
            metadata.uc,
            metadata.steps,
            metadata.sampler,
            format_desc_float(metadata.v2.guidance_scale as f64),
            metadata.seed,
            metadata.size,
            metadata.model,
            format_desc_float(metadata.strength),
            metadata.seed_mode,
            format_desc_float(metadata.shift),
        )
}

fn build_drawthings_xmp(json: &str, description: &str) -> String {
    let escaped_description = description.replace("\n", "&#xA;");
    format!(
        r#"<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about=""
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:xmp="http://ns.adobe.com/xap/1.0/"
            xmlns:exif="http://ns.adobe.com/exif/1.0/">
         <dc:description>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">{escaped_description}</rdf:li>
            </rdf:Alt>
         </dc:description>
         <xmp:CreatorTool>Draw Things</xmp:CreatorTool>
         <exif:UserComment>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">{json}</rdf:li>
            </rdf:Alt>
         </exif:UserComment>
      </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>
"#
    )
}
