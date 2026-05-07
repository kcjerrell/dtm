use chrono::{DateTime, NaiveDateTime};
// use entity::enums::Sampler; // Unused import

use super::tensor_history_mod::{Control, LoRA};
use crate::projects_db::dtos::tensor::{ModelAndWeight, TensorHistoryImport};
use crate::projects_db::tensor_history_generated::root_as_tensor_history_node;

impl TensorHistoryImport {
    pub fn new(
        blob: &[u8],
        row_id: i64,
        tensor_id: String,
        has_depth: bool,
        has_pose: bool,
        has_color: bool,
        has_custom: bool,
        has_scribble: bool,
        has_shuffle: bool,
        has_mask: bool,
    ) -> Result<Self, String> {
        // root_as_tensor_history_node returns a table accessor borrowed from blob
        let node = root_as_tensor_history_node(blob)
            .map_err(|e| format!("flatbuffers parse error: {:?}", e))?;

        let loras: Vec<ModelAndWeight> = node
            .loras()
            .map(|v| {
                v.iter()
                    .map(|l| ModelAndWeight {
                        model: l.file().unwrap().to_string(),
                        weight: l.weight(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let controls: Vec<ModelAndWeight> = node
            .controls()
            .map(|v| {
                v.iter()
                    .map(|c| ModelAndWeight {
                        model: c.file().unwrap().to_string(),
                        weight: c.weight(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(Self {
            prompt: node.text_prompt().unwrap_or("").trim().to_string(),
            negative_prompt: node.negative_text_prompt().unwrap_or("").trim().to_string(),
            model: node.model().unwrap_or("").trim().to_string(),
            lineage: node.lineage(),
            preview_id: node.preview_id(),
            tensor_id,
            row_id,
            controls,
            loras,
            generated: node.generated(),
            index_in_a_clip: node.index_in_a_clip(),
            logical_time: node.logical_time(),
            wall_clock: wall_clock_to_datetime(node.wall_clock()),
            cfg_zero_star: node.cfg_zero_star(),
            clip_id: node.clip_id(),
            num_frames: match node.clip_id() >= 0 {
                true => Some(node.num_frames()),
                false => None,
            },
            guidance_scale: node.guidance_scale(),
            hires_fix: node.hires_fix(),
            height: node.start_height(),
            refiner_model: node
                .refiner_model()
                .and_then(|v| Some(v.trim().to_string())),
            refiner_start: node.refiner_start(),
            resolution_dependent_shift: node.resolution_dependent_shift(),
            sampler: node.sampler().0,
            seed: node.seed(),
            shift: node.shift(),
            steps: node.steps(),
            strength: node.strength(),
            tiled_decoding: node.tiled_decoding(),
            tiled_diffusion: node.tiled_diffusion(),
            width: node.start_width(),
            tea_cache: node.tea_cache(),
            upscaler: node.upscaler().and_then(|v| Some(v.trim().to_string())),
            upscaler_scale_factor: node.upscaler_scale_factor(),
            has_depth,
            has_pose,
            has_color,
            has_custom,
            has_scribble,
            has_shuffle,
            has_mask,
            text_edits: node.text_edits(),
            text_lineage: node.text_lineage(),
        })
    }
}

fn wall_clock_to_datetime(value: i64) -> Option<NaiveDateTime> {
    if value > 1_000_000_000_000_000 {
        // microseconds
        let secs = value / 1_000_000;
        let micros = (value % 1_000_000) as u32;
        DateTime::from_timestamp(secs, micros * 1000).map(|dt| dt.naive_local())
    } else if value > 1_000_000_000 {
        // seconds
        DateTime::from_timestamp(value, 0).map(|dt| dt.naive_local())
    } else {
        None
    }
}
