use crate::projects_db::tensor_history_generated::{
    root_as_tensor_history_node as root_as_tensor_history_node_fb, LoRA as LoRAFb, LoRAMode,
};
use crate::projects_db::{
    dt_project::raw::TensorDataRow,
    fbs::{root_as_tensor_data, root_as_tensor_history_node, TensorData},
    tensor_history_mod::{Control, LoRA},
    tensor_history_tensor_data::TensorHistoryTensorData,
};
use crate::projects_db::dt_project::data::tensor_history_node_data::TensorHistoryNodeData;
use chrono::{DateTime, NaiveDateTime};

#[derive(serde::Serialize, Debug, Clone)]
pub struct ModelAndWeight {
    pub model: String,
    pub weight: f32,
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

fn update_history_import_flags(history: &mut TensorHistoryImport, tensor_data: &TensorData) {
    if tensor_data.tensor_id() > 0 {
        history.tensor_id = format!("tensor_history_{}", tensor_data.tensor_id());
    }
    if tensor_data.mask_id() > 0 {
        history.has_mask = true;
    }
    if tensor_data.depth_map_id() > 0 {
        history.has_depth = true;
    }
    if tensor_data.scribble_id() > 0 {
        history.has_scribble = true;
    }
    if tensor_data.pose_id() > 0 {
        history.has_pose = true;
    }
    if tensor_data.color_palette_id() > 0 {
        history.has_color = true;
    }
    if tensor_data.custom_id() > 0 {
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
pub struct TensorHistoryExtra {
    pub row_id: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub tensor_id: Option<String>,
    pub mask_id: Option<String>,
    pub depth_map_id: Option<String>,
    pub scribble_id: Option<String>,
    pub pose_id: Option<String>,
    pub color_palette_id: Option<String>,
    pub custom_id: Option<String>,
    pub moodboard: Vec<(String, f32)>,
    pub history: TensorHistoryNodeData,
    pub tensor_data: Option<Vec<TensorDataRow>>,
    pub project_path: String,
}

impl From<(Vec<TensorHistoryTensorData>, String)> for TensorHistoryExtra {
    fn from((rows, project_path): (Vec<TensorHistoryTensorData>, String)) -> Self {
        assert!(!rows.is_empty(), "must have at least one row");

        let node_id = rows[0].node_id;
        let lineage = rows[0].lineage;
        let logical_time = rows[0].logical_time;

        // Take the node data from the first row (they're all the same)
        let node_data = &rows[0].node_data;
        let history = TensorHistoryNodeData::try_from(node_data.as_ref()).unwrap();

        // Initialize optional fields
        let mut tensor_id: Option<String> = None;
        let mut mask_id: Option<String> = None;
        let mut depth_map_id: Option<String> = None;
        let mut scribble_id: Option<String> = None;
        let mut pose_id: Option<String> = None;
        let mut color_palette_id: Option<String> = None;
        let mut custom_id: Option<String> = None;
        let moodboard: Vec<(String, f32)> = Vec::new();
        let mut tensor_data_rows: Vec<TensorDataRow> = Vec::with_capacity(rows.len());

        // Iterate all tensor rows
        for row in rows {
            let td = TensorDataRow::from(row);

            if td.tensor_id > 0 {
                tensor_id = Some(format!("tensor_history_{}", td.tensor_id));
            }
            if td.mask_id > 0 {
                mask_id = Some(format!("binary_mask_{}", td.mask_id));
            }
            if td.depth_map_id > 0 {
                depth_map_id = Some(format!("depth_map_{}", td.depth_map_id));
            }
            if td.scribble_id > 0 {
                scribble_id = Some(format!("scribble_{}", td.scribble_id));
            }
            if td.pose_id > 0 {
                pose_id = Some(format!("pose_{}", td.pose_id));
            }
            if td.color_palette_id > 0 {
                color_palette_id = Some(format!("color_palette_{}", td.color_palette_id));
            }
            if td.custom_id > 0 {
                custom_id = Some(format!("custom_{}", td.custom_id));
            }

            // if let Some(mb_ids) = tensor_fb.() {
            //     moodboard.extend(mb_ids.iter().map(|s| (s.to_string(), 1.0)));
            // }

            tensor_data_rows.push(td);
        }

        Self {
            row_id: node_id,
            lineage,
            logical_time,
            tensor_id,
            mask_id,
            depth_map_id,
            scribble_id,
            pose_id,
            color_palette_id,
            custom_id,
            moodboard,
            history,
            tensor_data: Some(tensor_data_rows),
            project_path,
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
    pub data: Vec<u8>,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorSize {
    pub width: i32,
    pub height: i32,
    pub channels: i32,
}

