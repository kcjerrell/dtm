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

        let data = TensorHistoryNode::try_from(data)
            .map_err(|e| sqlx::Error::Protocol(format!("Failed to decode tensorhistorynode: {e}")))?;

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

    /**
     * Do not call on a cached dt_project! Only used with DTProject::open()
     */
    pub async fn check_id(&self, pdb_path: String, project_id: i64) -> Result<Vec<i64>, String> {
        if self.is_shared {
            return Err("Cannot check ids on a shared dt_project".to_string());
        }

        let missing_ids: Vec<i64> = sqlx::query_scalar(
            r#"
                ATTACH DATABASE ? AS pdb;

                SELECT pdb.images.id
                FROM pdb.images
                LEFT JOIN main.tensorhistorynode node ON pdb.images.node_id = node.rowid
                WHERE pdb.images.project_id = ?
                AND node.rowid IS NULL;
            "#,
        )
        .bind(pdb_path)
        .bind(project_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(missing_ids)
    }
}
