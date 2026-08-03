use std::collections::HashMap;

use async_trait::async_trait;
use sqlx::{sqlite::SqliteRow, Error, QueryBuilder, Row};

use crate::projects_db::{dt_project::fbs::root_as_tensor_history_node, DTProject};

#[async_trait]
pub trait Maintenance {
    async fn get_samplers(&self, node_ids: &[i64]) -> Result<HashMap<i64, i8>, Error>;
}

#[async_trait]
impl Maintenance for DTProject {
    async fn get_samplers(&self, node_ids: &[i64]) -> Result<HashMap<i64, i8>, Error> {
        let mut qb = QueryBuilder::new("SELECT rowid, p FROM tensorhistorynode WHERE rowid IN (");

        let mut separated = qb.separated(", ");
        for id in node_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
        let query = qb.build();
        let images = query
            .map(|row: SqliteRow| {
                let node_id: i64 = row.get(0);
                let history = root_as_tensor_history_node(row.get(1)).unwrap();
                let sampler = history.sampler();
                (node_id, sampler.0)
            })
            .fetch_all(&*self.pool)
            .await?;

        let mut samplers: HashMap<i64, i8> = HashMap::new();

        for (image_id, sampler) in images {
            if sampler != 1 {
                samplers.insert(image_id, sampler);
            }
        }

        Ok(samplers)
    }
}
