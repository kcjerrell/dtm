use anyhow::Result;
use flate2::read::DeflateDecoder;
use fpzip_sys::*;

use image::GrayImage;
use png::{BitDepth, ColorType, Encoder};

use std::ffi::c_void;
use std::io::Cursor;
use std::io::Read;

use crate::projects_db::dtos::tensor::{TensorHistoryNode, TensorRaw};
use crate::projects_db::metadata::DrawThingsMetadata;

pub struct DecodeTensorOptions {
    pub as_png: bool,
    pub history_node: Option<TensorHistoryNode>,
    pub scale: Option<u32>,
}

pub fn decode_tensor(tensor: TensorRaw, options: DecodeTensorOptions) -> Result<Vec<u8>, String> {
    let DecodeTensorOptions {
        as_png,
        history_node,
        scale,
    } = options;
    if tensor.name.starts_with("pose") {
        return decode_pose(tensor);
    }
    if tensor.name.starts_with("binary_mask") || tensor.name.starts_with("scribble") {
        return scribble_mask_to_png(tensor, scale, Some(false));
    }
    // log::debug!(
    //     "Decoding tensor {} ({}x{}x{})",
    //     tensor.name,
    //     tensor.height,
    //     tensor.width,
    //     tensor.channels
    // );

    let out = decompress_fzip(&tensor.data)?;
    // log::debug!(
    //     "Compressed: {} bytes, decompressed: {} bytes",
    //     &tensor.data.len(),
    //     out.len()
    // );

    let (pixels, width, height) = if let Some(target_size) = scale {
        log::debug!("Scaling to {}x{}", target_size, target_size);
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
        let mut pixels = vec![0u8; out.len()];
        for i in 0..out.len() {
            pixels[i] = ((out[i] * 0.5 + 0.5) * 255.0).round() as u8;
        }
        (pixels, tensor.width as u32, tensor.height as u32)
    };

    match as_png {
        true => write_png_with_usercomment(
            &pixels,
            width,
            height,
            tensor.channels as usize,
            history_node,
        )
        .map_err(|e| e.to_string()),
        false => Ok(pixels),
    }
}

fn decode_pose(tensor: TensorRaw) -> Result<Vec<u8>, String> {
    if tensor.data.len() >= 3
        && tensor.data[0] == 0x66
        && tensor.data[1] == 0x70
        && tensor.data[2] == 0x79
    {
        let dec = decompress_fzip(&tensor.data)?;
        Ok(f32_to_u8(dec))
    } else {
        Ok(tensor.data)
    }
}

pub fn decompress_fzip(data: &Vec<u8>) -> std::result::Result<Vec<f32>, String> {
    let out: Vec<f32>;

    // A valid FPZIP stream needs at least a few bytes for its header.
    // This also acts as a guard against empty buffers causing issues.
    if data.len() < 16 {
        if data.is_empty() {
            return Ok(vec![]);
        }
        return Err("Buffer is too small to contain a valid FPZIP header".to_string());
    }

    unsafe {
        let fpz: *mut FPZ = fpzip_read_from_buffer(data.as_ptr() as *const c_void);
        if fpz.is_null() {
            return Err("Failed to create FPZIP stream (pointer is null)".to_string());
        }

        if fpzip_read_header(fpz) == 0 {
            fpzip_read_close(fpz); // Ensure cleanup on error
            return Err("Failed to read FPZIP header".to_string());
        }

        let header = fpz.read();

        // Guard 1: Verify dimensions are non-negative
        // In C, dimensions are `int` (signed). Negative dimensions will corrupt usize casts.
        if header.nx < 0 || header.ny < 0 || header.nz < 0 || header.nf < 0 {
            fpzip_read_close(fpz);
            return Err("Invalid negative dimension in FPZIP header".to_string());
        }

        let nx = header.nx as usize;
        let ny = header.ny as usize;
        let nz = header.nz as usize;
        let nf = header.nf as usize;

        // Guard 2: Prevent integer overflow when calculating array size
        let total_values = match nx
            .checked_mul(ny)
            .and_then(|v| v.checked_mul(nz))
            .and_then(|v| v.checked_mul(nf))
        {
            Some(v) => v,
            None => {
                fpzip_read_close(fpz);
                return Err("Tensor dimensions lead to integer overflow".to_string());
            }
        };

        if total_values == 0 {
            fpzip_read_close(fpz);
            return Ok(vec![]);
        }

        // Guard 3: Prevent absurdly large tensor sizes (e.g. maxing out at ~2GB of memory usage)
        let max_values = 512 * 1024 * 1024; // 512M elements (f32)
        if total_values > max_values {
            fpzip_read_close(fpz);
            return Err(format!(
                "Tensor size is too large (exceeds maximum allowed {} elements)",
                max_values
            ));
        }

        // Check the type from the header (bindgen usually maps C 'type' to 'type_')
        // constants from fpzip.h: FPZIP_TYPE_FLOAT=0, FPZIP_TYPE_DOUBLE=1
        if header.type_ == FPZIP_TYPE_DOUBLE as i32 {
            // Double precision: read as f64 then convert to f32
            let mut out_f64 = Vec::new();

            // Guard 4: Use try_reserve_exact to catch OOM conditions gracefully instead of panicking
            if out_f64.try_reserve_exact(total_values).is_err() {
                fpzip_read_close(fpz);
                return Err(format!(
                    "Failed to allocate memory for tensor decompression ({} elements)",
                    total_values
                ));
            }
            out_f64.resize(total_values, 0.0f64);

            let n_read = fpzip_read(fpz, out_f64.as_mut_ptr() as *mut c_void);
            fpzip_read_close(fpz);

            // Guard 5: Ensure reading neither failed nor read past our data buffer (buffer over-read defense)
            if n_read == 0 || n_read > data.len() {
                return Err(format!(
                    "FPZIP read failed or read out of bounds (n_read: {}, data.len: {})",
                    n_read,
                    data.len()
                ));
            }

            out = out_f64.into_iter().map(|v| v as f32).collect();
        } else {
            // Assume float (FPZIP_TYPE_FLOAT=0)
            let mut out_f32 = Vec::new();

            // Guard 4: Graceful OOM handling
            if out_f32.try_reserve_exact(total_values).is_err() {
                fpzip_read_close(fpz);
                return Err(format!(
                    "Failed to allocate memory for tensor decompression ({} elements)",
                    total_values
                ));
            }
            out_f32.resize(total_values, 0.0f32);

            let n_read = fpzip_read(fpz, out_f32.as_mut_ptr() as *mut c_void);
            fpzip_read_close(fpz);

            // Guard 5: Ensure read bounds
            if n_read == 0 || n_read > data.len() {
                return Err(format!(
                    "FPZIP read failed or read out of bounds (n_read: {}, data.len: {})",
                    n_read,
                    data.len()
                ));
            }

            out = out_f32;
        }
    }

    Ok(out)
}

pub fn scribble_mask_to_png(
    tensor: TensorRaw,
    scale: Option<u32>,
    invert: Option<bool>,
) -> Result<Vec<u8>, String> {
    let data = inflate_deflate(&tensor.data).map_err(|e| e.to_string())?;
    let should_invert = invert.unwrap_or(false);
    let bw: Vec<u8> = data
        .iter()
        .map(|&x| if (x > 0) ^ should_invert { 255 } else { 0 })
        .collect();

    let height = i32::from_le_bytes(tensor.dim[0..4].try_into().unwrap_or_default()) as u32;
    let width = i32::from_le_bytes(tensor.dim[4..8].try_into().unwrap_or_default()) as u32;

    let mut img = GrayImage::from_raw(width, height, bw)
        .ok_or_else(|| "Failed to create image from raw".to_string())?;

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

        resized
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
    } else {
        img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
    }

    Ok(out)
}

fn inflate_deflate(data: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut decoder = DeflateDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

fn f32_to_u8(vec: Vec<f32>) -> Vec<u8> {
    let len = vec.len() * std::mem::size_of::<f32>();
    let mut u8_vec = Vec::with_capacity(len);

    for f in vec {
        u8_vec.extend_from_slice(&f.to_le_bytes());
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

pub fn build_description(metadata: &DrawThingsMetadata) -> String {
    /*
    sample description:
    this image has awesome metadata. it is a picture of a cool dude
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
