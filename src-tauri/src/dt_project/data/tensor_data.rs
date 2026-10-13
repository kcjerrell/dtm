use crate::dt_project::fbs::root_as_tensor_data as root_as_tensor_data_fb;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct TensorData {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    #[serde(rename = "idx", alias = "index")]
    pub index: i64,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale_factor_by_120: i32,
    pub tensor_id: i64,
    pub mask_id: i64,
    pub depth_map_id: i64,
    pub scribble_id: i64,
    pub pose_id: i64,
    pub color_palette_id: i64,
    pub custom_id: i64,
}

impl TryFrom<&[u8]> for TensorData {
    type Error = flatbuffers::InvalidFlatbuffer;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        let td = root_as_tensor_data_fb(bytes)?;

        Ok(TensorData {
            rowid: 0,
            lineage: td.lineage(),
            logical_time: td.logical_time(),
            index: td.index(),
            x: td.x(),
            y: td.y(),
            width: td.width(),
            height: td.height(),
            scale_factor_by_120: td.scale_factor_by_120(),
            tensor_id: td.tensor_id(),
            mask_id: td.mask_id(),
            depth_map_id: td.depth_map_id(),
            scribble_id: td.scribble_id(),
            pose_id: td.pose_id(),
            color_palette_id: td.color_palette_id(),
            custom_id: td.custom_id(),
        })
    }
}

// impl From<TensorHistoryTensorData> for TensorData {
//     fn from(value: TensorHistoryTensorData) -> Self {
//         let data = root_as_tensor_data_fb(&value.tensor_data).unwrap();
//         Self {
//             rowid: value.node_id,
//             lineage: value.lineage,
//             logical_time: value.logical_time,
//             index: value.td_index,
//             x: data.x(),
//             y: data.y(),
//             width: data.width(),
//             height: data.height(),
//             scale_factor_by_120: data.scale_factor_by_120(),
//             tensor_id: data.tensor_id(),
//             mask_id: data.mask_id(),
//             depth_map_id: data.depth_map_id(),
//             scribble_id: data.scribble_id(),
//             pose_id: data.pose_id(),
//             color_palette_id: data.color_palette_id(),
//             custom_id: data.custom_id(),
//         }
//     }
// }
