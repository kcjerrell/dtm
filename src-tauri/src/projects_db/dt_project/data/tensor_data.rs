use crate::projects_db::fbs::root_as_tensor_data as root_as_tensor_data_fb;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct TensorData {
    pub lineage: i64,
    pub logical_time: i64,
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
