use dtm_macros::dtp_commands;

use crate::{
    dtp_service::DTPService,
    projects_db::{ProjectRef, TensorHistoryNodeRow},
};

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn dt_list_tensor_history_node(
        &self,
        project_id: i64,
        skip: i64,
        take: i64,
    ) -> Result<Vec<TensorHistoryNodeRow>, String> {
        let dt_project = self
            .get_db()
            .await?
            .get_dt_project(ProjectRef::Id(project_id))
            .await?;
        let rows = dt_project
            .list_tensor_history_nodes(skip, take)
            .await
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
}
