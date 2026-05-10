use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, FromRow, Row};
use std::sync::Arc;

use crate::projects_db::{
    dt_project::{
        data::tensor_data::TensorData as ParsedTensorData,
    },
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
    FirstAndTake(i64, i64),
}

#[derive(Serialize, Debug)]
pub struct TensorData {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub idx: i64,
    #[serde(serialize_with = "serialize_tensor_data")]
    data: Arc<[u8]>,
}

fn serialize_tensor_data<S>(data: &Arc<[u8]>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use serde::ser::Error;
    match ParsedTensorData::try_from(data.as_ref()) {
        Ok(parsed) => parsed.serialize(serializer),
        Err(e) => Err(S::Error::custom(e)),
    }
}

impl TensorData {
    pub fn data(&self) -> TensorDataData {
        unsafe { root_as_tensor_data_unchecked(&self.data) }
    }
}

impl<'r> FromRow<'r, SqliteRow> for TensorData {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid: i64 = row.get("rowid");
        let lineage: i64 = row.get("__pk0");
        let logical_time: i64 = row.get("__pk1");
        let idx: i64 = row.get("__pk2");
        let data: Vec<u8> = row.get("p");
        let data: Arc<[u8]> = data.into();

        match root_as_tensor_data(&data) {
            Ok(_) => Ok(TensorData {
                rowid,
                lineage,
                logical_time,
                idx,
                data,
            }),
            Err(e) => Err(sqlx::Error::Decode(e.to_string().into())),
        }
    }
}

impl DTProject {
    pub async fn get_tensor_data(&self, filter: TdFilter) -> Result<Vec<TensorData>, sqlx::Error> {
        let query = build_query(filter);
        query_as(&query).fetch_all(&*self.pool).await
    }
}

fn build_query(filter: TdFilter) -> String {
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
            format!(
                "WHERE (td.__pk0, td.__pk1) IN ({})",
                items_str.join(", ")
            )
        }
        TdFilter::LineageTimeIdx(lineage, logical_time, idx) => {
            format!(
                "WHERE td.__pk0 = {} AND td.__pk1 = {} AND td.__pk2 = {}",
                lineage, logical_time, idx
            )
        }
        TdFilter::FirstAndTake(first, take) => {
            limit_str = format!("LIMIT {}", take);
            format!("WHERE td.rowid >= {}", first)
        }
    };

    let query = format!(
        "{} {} ORDER BY td.rowid ASC {}",
        select, filter_str, limit_str
    );
    println!("{query}");
    query
}
