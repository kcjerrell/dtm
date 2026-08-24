use anyhow::Context;
use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, AssertSqlSafe, FromRow, Row};
use std::{collections::HashSet, sync::Arc};

use crate::dt_project::DTProject;
use crate::dt_project::{
    data::TensorData as ParsedTensorData,
    fbs::{root_as_tensor_data, root_as_tensor_data_unchecked, TensorData as TensorDataData},
    DTProjectTable,
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
    /// Returns the raw FlatBuffer accessor. Prefer this for cheap field reads.
    /// This method is safe - the flatbuffer was validated at construction
    /// and can be accessed unchecked
    pub fn data(&self) -> TensorDataData<'_> {
        unsafe { root_as_tensor_data_unchecked(&self.raw_data) }
    }

    pub fn get_tensor_ids(&self) -> Vec<i64> {
        let mut ids = HashSet::<i64>::new();

        ids.insert(self.data().mask_id());
        ids.insert(self.data().pose_id());
        ids.insert(self.data().custom_id());
        ids.insert(self.data().tensor_id());
        ids.insert(self.data().scribble_id());
        ids.insert(self.data().depth_map_id());
        ids.insert(self.data().color_palette_id());

        ids.iter().filter(|id| id > &(&0)).copied().collect()
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
    pub async fn get_tensor_data(&self, filter: TdFilter) -> anyhow::Result<Vec<TensorData>> {
        self.check_table(&DTProjectTable::TensorData).await?;
        let query = build_query(filter);
        let res = query_as(query)
            .fetch_all(&*self.pool)
            .await
            .with_context(|| format!("failed to query tensor data for project {}", self.path))?;
        Ok(res)
    }

    pub async fn list_tensor_data_ids(&self) -> anyhow::Result<Vec<i64>> {
        self.check_table(&DTProjectTable::TensorData).await?;
        let query = "SELECT rowid FROM tensordata";
        let res: Vec<i64> = sqlx::query_scalar(query)
            .fetch_all(&*self.pool)
            .await
            .with_context(|| format!("failed to list tensor data IDs for project {}", self.path))?;
        Ok(res)
    }

    pub async fn find_tensordata_by_tensor(
        &self,
        tensor_name: &str,
    ) -> anyhow::Result<Vec<TensorData>> {
        if let Some((prefix, id)) = tensor_name.rsplit_once("_") {
            let (index_table, index_col) = index_table(prefix)
                .ok_or_else(|| anyhow::anyhow!("Invalid tensor name prefix for '{}'", tensor_name))?;
            let id: i64 = id
                .parse()
                .with_context(|| format!("failed to parse tensor index from '{}'", tensor_name))?;

            let query = format!(
                "SELECT * FROM tensordata td
                 JOIN {} tdf ON td.rowid = tdf.rowid
                 WHERE tdf.{} = ?1",
                index_table, index_col
            );

            let res = query_as(AssertSqlSafe(query))
                .bind(id)
                .fetch_all(&*self.pool)
                .await
                .with_context(|| format!("failed to query tensordata for tensor '{}' in project {}", tensor_name, self.path))?;
            return Ok(res);
        }
        anyhow::bail!("Invalid tensor name: {}", tensor_name)
    }
}

fn index_table(tensor_name_prefix: &str) -> Option<(&str, &str)> {
    match tensor_name_prefix {
        "tensor_history" => Some(("tensordata__f20", "f20")),
        "binary_mask" => Some(("tensordata__f22", "f22")),
        "depth_map" => Some(("tensordata__f24", "f24")),
        "scribble" => Some(("tensordata__f26", "f26")),
        "pose" => Some(("tensordata__f28", "f28")),
        "color_palette" => Some(("tensordata__f30", "f30")),
        "custom" => Some(("tensordata__f32", "f32")),
        _ => None,
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
