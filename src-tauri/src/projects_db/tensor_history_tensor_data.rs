use anyhow::Result;
use sqlx::Database;
use sqlx::{FromRow, Row};

#[derive(Debug, Clone, FromRow)]
pub struct TensorHistoryTensorData {
    pub node_id: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub td_index: i64,
    pub node_data: Vec<u8>,
    pub tensor_data: Vec<u8>,
}
