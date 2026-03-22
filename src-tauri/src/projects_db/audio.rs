use std::{
    fmt::Error,
    io::{BufWriter, Cursor},
};

use crate::projects_db::{
    dtos::tensor::{TensorHistoryNode, TensorRaw},
    tensors::decompress_fzip,
};

pub async fn decode_audio(tensor: TensorRaw, duration: f64) -> Result<Vec<u8>, String> {
    let channels = tensor.n;
    let length = tensor.height as usize;

    let sample_rate = if duration > 0.0 {
        (length as f64 / duration) as u32
    } else {
        48000
    };

    let spec = hound::WavSpec {
        channels: channels as u16,
        sample_format: hound::SampleFormat::Float,
        bits_per_sample: 32,
        sample_rate: 48000,
    };

    let mut buffer = Vec::new();
    let buf_writer = BufWriter::new(Cursor::new(&mut buffer));

    let mut writer = hound::WavWriter::new(buf_writer, spec).unwrap();

    let decompressed = decompress_fzip(&tensor.data).unwrap();
    let left = &decompressed[0..length];
    let right = &decompressed[length..];

    for i in 0..length {
        writer.write_sample(left[i]).unwrap();
        writer.write_sample(right[i]).unwrap();
    }

    writer.finalize().unwrap();

    Ok(buffer)
}
