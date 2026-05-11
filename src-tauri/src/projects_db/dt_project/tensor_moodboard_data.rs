use serde::Serialize;
use sqlx::{query_as, sqlite::SqliteRow, FromRow, Row};

use crate::projects_db::{
    dt_project::DTProjectTable, fbs::root_as_tensor_moodboard_data, DTProject,
};

pub enum TmdFilter {
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

#[derive(Serialize, Debug)]
pub struct TensorMoodboardData {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub idx: i64,
    pub shuffle_id: i64,
    pub weight: f32,
    pub tensor_name: String,
}

impl<'r> FromRow<'r, SqliteRow> for TensorMoodboardData {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid: i64 = row.get("rowid");
        let lineage: i64 = row.get("__pk0");
        let logical_time: i64 = row.get("__pk1");
        let idx: i64 = row.get("__pk2");
        let data: Vec<u8> = row.get("p");

        match root_as_tensor_moodboard_data(&data) {
            Ok(fb) => Ok(TensorMoodboardData {
                rowid,
                lineage,
                logical_time,
                idx,
                shuffle_id: fb.shuffle_id(),
                weight: fb.weight(),
                tensor_name: format!("shuffle_{}", fb.shuffle_id()),
            }),
            Err(e) => Err(sqlx::Error::Decode(e.to_string().into())),
        }
    }
}

impl DTProject {
    pub async fn get_tensor_moodboard_data(
        &self,
        filter: TmdFilter,
    ) -> Result<Vec<TensorMoodboardData>, sqlx::Error> {
        self.check_table(&DTProjectTable::TensorMoodboardData)
            .await?;
        let query = build_query(filter);
        query_as(&query).fetch_all(&*self.pool).await
    }
}

fn build_query(filter: TmdFilter) -> String {
    let select = "SELECT * FROM tensormoodboarddata tmd";

    let mut limit_str = "".to_string();

    let filter_str: String = match filter {
        TmdFilter::None => "".to_string(),
        TmdFilter::Rowid(rowid) => format!("WHERE tmd.rowid = {}", rowid),
        TmdFilter::Lineage(lineage) => format!("WHERE tmd.__pk0 = {}", lineage),
        TmdFilter::LogicalTime(logical_time) => format!("WHERE tmd.__pk1 = {}", logical_time),
        TmdFilter::LineageTime(lineage, logical_time) => format!(
            "WHERE tmd.__pk0 = {} AND tmd.__pk1 = {}",
            lineage, logical_time
        ),
        TmdFilter::LineageTimes(items) => {
            let items_str: Vec<String> = items
                .iter()
                .map(|(l, lt)| format!("({}, {})", l, lt))
                .collect();
            format!("WHERE (tmd.__pk0, tmd.__pk1) IN ({})", items_str.join(", "))
        }
        TmdFilter::LineageTimeIdx(lineage, logical_time, idx) => {
            format!(
                "WHERE tmd.__pk0 = {} AND tmd.__pk1 = {} AND tmd.__pk2 = {}",
                lineage, logical_time, idx
            )
        }
        TmdFilter::SkipAndTake(skip, take) => {
            limit_str = format!("LIMIT {} OFFSET {}", take, skip);
            "".to_string()
        }
        TmdFilter::Range(min, max) => {
            format!("WHERE tmd.rowid >= {} AND tmd.rowid < {}", min, max)
        }
    };

    let query = format!(
        "{} {} ORDER BY tmd.rowid ASC {}",
        select, filter_str, limit_str
    );
    println!("{query}");
    query
}
