use sqlx::{prelude::*, sqlite::SqliteRow};

use crate::dt_project::DTResource;

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
