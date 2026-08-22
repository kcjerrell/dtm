use anyhow::Context;
use sqlx::query;

use crate::dt_project::DTProject;

impl DTProject {
    pub async fn set_tensor_data(&self, values: Vec<(String, Vec<u8>)>) -> anyhow::Result<()> {
        if !self.allow_mutate {
            anyhow::bail!("Cannot set tensor data on read-only project database {}", self.path);
        }

        for (tensor_name, data) in values {
            let res = query("UPDATE tensors SET data = ?1 WHERE tensor_name = ?2")
                .bind(&data)
                .bind(&tensor_name)
                .execute(&*self.pool)
                .await
                .with_context(|| format!("failed to update tensor data for '{}' in project {}", tensor_name, self.path))?;

            if res.rows_affected() == 0 {
                anyhow::bail!("Tensor '{}' not found in project database {}", tensor_name, self.path);
            }
        }

        Ok(())
    }
}
