use crate::projects_db::fbs::tensor_history_generated::{Control as ControlFb, LoRA as LoRAFb};
use crate::projects_db::{
    dt_project::{TensorData,DTResource},
    fbs::{root_as_tensor_data, TensorData as TensorDataFb},
    tensor_history_tensor_data::TensorHistoryTensorData,
};
use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::{FromRow, Row};

pub const PREFIX_TENSOR: &str = "tensor_history";
pub const PREFIX_MASK: &str = "binary_mask";
pub const PREFIX_DEPTH: &str = "depth_map";
pub const PREFIX_SCRIBBLE: &str = "scribble";
pub const PREFIX_POSE: &str = "pose";
pub const PREFIX_COLOR: &str = "color_palette";
pub const PREFIX_CUSTOM: &str = "custom";

pub fn format_resource_id(prefix: &str, id: i64) -> Option<String> {
    if id > 0 {
        Some(format!("{}_{}", prefix, id))
    } else {
        None
    }
}

pub struct TensorFlags {
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_mask: bool,
}

impl TensorFlags {
    pub fn from_fb(td: &TensorDataFb) -> Self {
        Self {
            has_depth: td.depth_map_id() > 0,
            has_pose: td.pose_id() > 0,
            has_color: td.color_palette_id() > 0,
            has_custom: td.custom_id() > 0,
            has_scribble: td.scribble_id() > 0,
            has_mask: td.mask_id() > 0,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct ModelAndWeight {
    pub model: String,
    pub weight: f32,
}

impl ModelAndWeight {
    pub fn from_lora_fb(lora: &LoRAFb) -> Self {
        Self {
            model: lora.file().unwrap_or_default().to_string(),
            weight: lora.weight(),
        }
    }

    pub fn from_control_fb(control: &ControlFb) -> Self {
        Self {
            model: control.file().unwrap_or_default().to_string(),
            weight: control.weight(),
        }
    }
}

#[derive(serde::Serialize, Debug)]
pub struct TensorHistoryImport {
    pub lineage: i64,
    pub logical_time: i64,
    pub tensor_id: String,
    pub width: u16,
    pub height: u16,
    pub seed: u32,
    pub steps: u32,
    pub guidance_scale: f32,
    pub strength: f32,
    pub model: String,
    pub wall_clock: Option<NaiveDateTime>,
    pub sampler: i8,
    pub hires_fix: bool,
    pub upscaler: Option<String>,
    pub upscaler_scale_factor: u8,
    pub generated: bool,
    pub controls: Vec<ModelAndWeight>,
    pub loras: Vec<ModelAndWeight>,
    pub preview_id: i64,
    pub refiner_model: Option<String>,
    pub refiner_start: f32,
    pub shift: f32,
    pub tiled_decoding: bool,
    pub tiled_diffusion: bool,
    pub resolution_dependent_shift: bool,
    pub tea_cache: bool,
    pub prompt: String,
    pub negative_prompt: String,
    pub clip_id: i64,
    pub index_in_a_clip: i32,
    pub num_frames: Option<u32>,
    pub cfg_zero_star: bool,
    pub row_id: i64,
    pub has_depth: bool,
    pub has_pose: bool,
    pub has_color: bool,
    pub has_custom: bool,
    pub has_scribble: bool,
    pub has_shuffle: bool,
    pub has_mask: bool,
    pub text_edits: i64,
    pub text_lineage: i64,
}

impl From<&TensorHistoryTensorData> for TensorHistoryImport {
    fn from(row: &TensorHistoryTensorData) -> Self {
        let row_id = row.node_id;

        let node_data = &row.node_data;
        let tensor_data = root_as_tensor_data(&row.tensor_data).unwrap();

        let mut history = TensorHistoryImport::new(
            node_data,
            row_id,
            "".to_string(),
            false,
            false,
            false,
            false,
            false,
            false,
            false,
        )
        .unwrap();

        update_history_import_flags(&mut history, &tensor_data);

        history
    }
}

fn update_history_import_flags(history: &mut TensorHistoryImport, tensor_data: &TensorDataFb) {
    if let Some(id) = format_resource_id(PREFIX_TENSOR, tensor_data.tensor_id()) {
        history.tensor_id = id;
    }

    let flags = TensorFlags::from_fb(tensor_data);
    if flags.has_mask {
        history.has_mask = true;
    }
    if flags.has_depth {
        history.has_depth = true;
    }
    if flags.has_scribble {
        history.has_scribble = true;
    }
    if flags.has_pose {
        history.has_pose = true;
    }
    if flags.has_color {
        history.has_color = true;
    }
    if flags.has_custom {
        history.has_custom = true;
    }
}

pub struct TensorNodeGrouper<'a> {
    index: usize,
    // data: &[TensorHistoryTensorData],
    current_row: Option<&'a TensorHistoryTensorData>,
    current_item: Option<TensorHistoryImport>,
    rows_iter: std::slice::Iter<'a, TensorHistoryTensorData>,
}

impl Iterator for TensorNodeGrouper<'_> {
    type Item = TensorHistoryImport;
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            // if we don't have a row, pop one off
            let row = self.current_row.or_else(|| self.rows_iter.next());

            // when no rows are left, return the item (or none)
            if row.is_none() {
                return self.current_item.take();
            }
            let row = row.unwrap();

            // if we don't have an item, make one
            let item = self.current_item.take();
            let mut item = item.unwrap_or_else(|| TensorHistoryImport::from(row));

            // if the row doesn't match, clear the item return it
            if row.node_id != item.row_id {
                self.current_row = Some(row);
                return Some(item);
            }

            // otherwise, the row matches the item, update the item and clear the row
            update_history_import_flags(&mut item, &root_as_tensor_data(&row.tensor_data).unwrap());
            self.current_row = None;

            // hold onto before looping
            self.current_item = Some(item);
        }
    }
}

impl<'a> TensorNodeGrouper<'a> {
    pub fn new(data: &'a [TensorHistoryTensorData]) -> Self {
        Self {
            index: 0,
            rows_iter: data.iter(),
            current_row: None,
            current_item: None,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorRaw {
    pub name: String,
    pub tensor_type: i64,
    pub data_type: i32,
    pub format: i32,
    pub n: i32,
    pub width: i32,
    pub height: i32,
    pub channels: i32,
    pub dim: Vec<u8>,
    pub resource: DTResource,
}

impl FromRow<'_, SqliteRow> for TensorRaw {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let name: String = row.get("name");
        let tensor_type: i64 = row.get("type");
        let format: i32 = row.get("format");
        let data_type: i32 = row.get("datatype");
        let dim: Vec<u8> = row.get("dim");
        let data: Vec<u8> = row.get("data");

        let n = i32::from_le_bytes(dim[0..4].try_into().ok().unwrap());
        let height = i32::from_le_bytes(dim[4..8].try_into().ok().unwrap());
        let width = i32::from_le_bytes(dim[8..12].try_into().ok().unwrap());
        let channels = i32::from_le_bytes(dim[12..16].try_into().ok().unwrap());

        // Use CompressedTensor for now; get_tensor_raw will update to DTZipRef if needed
        let resource = DTResource::compressed_tensor(data);

        Ok(Self {
            name,
            tensor_type,
            format,
            data_type,
            n,
            height,
            width,
            channels,
            dim,
            resource,
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorSize {
    pub width: i32,
    pub height: i32,
    pub channels: i32,
}
