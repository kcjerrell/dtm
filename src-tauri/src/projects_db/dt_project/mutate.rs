use sqlx::query;

impl super::DTProject {
    pub async fn set_tensor_data(&self, values: Vec<(String, Vec<u8>)>) -> anyhow::Result<()> {
        if !self.allow_mutate {
            anyhow::bail!("Cannot set tensor data on a read-only project - must open project with DTProject::open_mut()");
        }

        for (tensor_name, data) in values {
            let res = query("UPDATE tensors SET data = ?1 WHERE tensor_name = ?2")
                .bind(&data)
                .bind(&tensor_name)
                .execute(&*self.pool)
                .await?;

            if res.rows_affected() == 0 {
                anyhow::bail!("Tensor data not found for tensor name: {}", tensor_name);
            }
        }

        Ok(())
    }
}
