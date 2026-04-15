use serde::Serialize;
use sqlx::{query, query_as, sqlite::SqliteRow, FromRow, Row};

use crate::projects_db::{dtos::tensor::TensorHistoryNode, DTProject};

#[derive(Serialize, Debug, Clone)]
pub struct TensorHistoryNodeRow {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub data: TensorHistoryNode,
}

impl<'r> FromRow<'r, SqliteRow> for TensorHistoryNodeRow {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid: i64 = row.get("rowid");
        let lineage: i64 = row.get("__pk0");
        let logical_time: i64 = row.get("__pk1");
        let data: &[u8] = row.get("p");

        let data = TensorHistoryNode::try_from(data).unwrap();

        Ok(TensorHistoryNodeRow {
            rowid,
            lineage,
            logical_time,
            data,
        })
    }
}

impl DTProject {
    pub async fn list_tensor_history_nodes(
        &self,
        skip: i64,
        take: i64,
    ) -> Result<Vec<TensorHistoryNodeRow>, sqlx::Error> {
        let rows: Vec<TensorHistoryNodeRow> =
            query_as("SELECT * FROM tensorhistorynode ORDER BY rowid ASC LIMIT ?1 OFFSET ?2")
                .bind(take)
                .bind(skip)
                .fetch_all(&*self.pool)
                .await?;

        Ok(rows)
    }
}
