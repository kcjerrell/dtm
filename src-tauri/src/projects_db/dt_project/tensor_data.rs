use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, AssertSqlSafe, FromRow, Row};
use std::sync::Arc;

use crate::projects_db::{
    dt_project::{data::tensor_data::TensorData as ParsedTensorData, DTProjectTable},
    fbs::{root_as_tensor_data, root_as_tensor_data_unchecked, TensorData as TensorDataData},
    DTProject,
};

pub enum TdFilter {
    None,
    Rowid(i64),
    Lineage(i64),
    LogicalTime(i64),
    LineageTime(i64, i64),
    LineageTimes(Vec<(i64, i64)>),
    LineageTimeIdx(i64, i64, i64),
    SkipAndTake(i64, i64),
    Range(i64, i64),
}

/// The definitive representation of a tensor data row in a Draw Things project.
#[derive(Serialize, Debug)]
pub struct TensorData {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub idx: i64,
    pub tensor_names: Vec<String>,
    pub mask: Option<String>,
    pub data: Option<ParsedTensorData>,
    #[serde(skip)]
    raw_data: Arc<[u8]>,
}


impl TensorData {
    pub fn data(&self) -> TensorDataData {
        unsafe { root_as_tensor_data_unchecked(&self.raw_data) }
    }
}

impl<'r> FromRow<'r, SqliteRow> for TensorData {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid: i64 = row.get("rowid");
        let lineage: i64 = row.get("__pk0");
        let logical_time: i64 = row.get("__pk1");
        let idx: i64 = row.get("__pk2");
        let raw_data: Vec<u8> = row.get("p");
        let raw_data: Arc<[u8]> = raw_data.into();

        match root_as_tensor_data(&raw_data) {
            Ok(fb) => {
                let mut tensor_names: Vec<String> = Vec::new();
                if fb.color_palette_id() != 0 {
                    tensor_names.push(format!("color_palette_{}", fb.color_palette_id()));
                }
                if fb.custom_id() != 0 {
                    tensor_names.push(format!("custom_{}", fb.custom_id()));
                }
                if fb.pose_id() != 0 {
                    tensor_names.push(format!("pose_{}", fb.pose_id()));
                }
                if fb.scribble_id() != 0 {
                    tensor_names.push(format!("scribble_{}", fb.scribble_id()));
                }
                if fb.depth_map_id() != 0 {
                    tensor_names.push(format!("depth_map_{}", fb.depth_map_id()));
                }
                if fb.tensor_id() != 0 {
                    tensor_names.push(format!("tensor_history_{}", fb.tensor_id()));
                }
                if fb.mask_id() != 0 {
                    tensor_names.push(format!("binary_mask_{}", fb.mask_id()));
                }

                let mask = if fb.mask_id() != 0 {
                    Some(format!("binary_mask_{}", fb.mask_id()))
                } else {
                    None
                };

                let mut parsed = ParsedTensorData::try_from(raw_data.as_ref()).ok();
                if let Some(p) = parsed.as_mut() {
                    p.rowid = rowid;
                }

                Ok(TensorData {
                    rowid,
                    lineage,
                    logical_time,
                    idx,
                    raw_data,
                    tensor_names,
                    mask,
                    data: parsed,
                })
            }
            Err(e) => Err(sqlx::Error::Decode(e.to_string().into())),
        }
    }
}

impl DTProject {
    pub async fn get_tensor_data(&self, filter: TdFilter) -> Result<Vec<TensorData>, sqlx::Error> {
        self.check_table(&DTProjectTable::TensorData).await?;
        let query = build_query(filter);
        query_as(query).fetch_all(&*self.pool).await
    }
}

fn build_query(filter: TdFilter) -> AssertSqlSafe<String> {
    let select = "SELECT * FROM tensordata td";

    let mut limit_str = "".to_string();

    let filter_str: String = match filter {
        TdFilter::None => "".to_string(),
        TdFilter::Rowid(rowid) => format!("WHERE td.rowid = {}", rowid),
        TdFilter::Lineage(lineage) => format!("WHERE td.__pk0 = {}", lineage),
        TdFilter::LogicalTime(logical_time) => format!("WHERE td.__pk1 = {}", logical_time),
        TdFilter::LineageTime(lineage, logical_time) => format!(
            "WHERE td.__pk0 = {} AND td.__pk1 = {}",
            lineage, logical_time
        ),
        TdFilter::LineageTimes(items) => {
            let items_str: Vec<String> = items
                .iter()
                .map(|(l, lt)| format!("({}, {})", l, lt))
                .collect();
            format!("WHERE (td.__pk0, td.__pk1) IN ({})", items_str.join(", "))
        }
        TdFilter::LineageTimeIdx(lineage, logical_time, idx) => {
            format!(
                "WHERE td.__pk0 = {} AND td.__pk1 = {} AND td.__pk2 = {}",
                lineage, logical_time, idx
            )
        }
        TdFilter::SkipAndTake(skip, take) => {
            limit_str = format!("LIMIT {} OFFSET {}", take, skip);
            "".to_string()
        }
        TdFilter::Range(min, max) => {
            format!("WHERE td.rowid >= {} AND td.rowid < {}", min, max)
        }
    };

    let query = format!(
        "{} {} ORDER BY td.rowid ASC {}",
        select, filter_str, limit_str
    );
    AssertSqlSafe(query)
}
