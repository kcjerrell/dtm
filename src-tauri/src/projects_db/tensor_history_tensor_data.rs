use anyhow::Result;
use sqlx::{sqlite::SqliteRow, FromRow, Row};

#[derive(Debug)]
pub struct TensorHistoryTensorData {
    pub node_id: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub td_index: i64,
    pub node_data: Vec<u8>,
    pub tensor_data: Vec<u8>,
}

impl<'r> FromRow<'r, SqliteRow> for TensorHistoryTensorData {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let node_id: i64 = row.try_get("rowid")?;
        let lineage: i64 = row.try_get("lineage")?;
        let logical_time: i64 = row.try_get("logical_time")?;
        let td_index: i64 = row.try_get("td_index")?;

        let node_data: Vec<u8> = row.try_get("node_data")?;
        let tensor_data: Vec<u8> = row.try_get("tensor_data")?;

        Ok(Self {
            node_id,
            lineage,
            logical_time,
            td_index,
            node_data,
            tensor_data,
        })
    }
}
