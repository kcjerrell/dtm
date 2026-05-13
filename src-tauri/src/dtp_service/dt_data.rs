use dtm_macros::dtp_commands;

use crate::{
    dtp_service::DTPService,
    projects_db::{
        dt_project::{TensorHistoryNode, ThnData, ThnFilter},
        ProjectRef,
    },
};

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn dt_get_tensor_history_nodes(
        &self,
        project_id: Option<i64>,
        project_path: Option<String>,
        skip: Option<i64>,
        take: Option<i64>,
        lineage: Option<i64>,
        logical_time: Option<i64>,
        rowid: Option<i64>,
        min_rowid: Option<i64>,
        max_rowid: Option<i64>,
        select: Option<Vec<String>>,
    ) -> Result<Vec<TensorHistoryNode>, String> {
        let project_ref = if let Some(id) = project_id {
            ProjectRef::Id(id)
        } else if let Some(path) = project_path {
            ProjectRef::Path(path)
        } else {
            return Err("project_id or project_path is required".to_string());
        };

        let dt_project = self.get_db().await?.get_dt_project(project_ref).await?;

        let filter = if let Some(r) = rowid {
            Some(ThnFilter::Rowid(r))
        } else if let (Some(lin), Some(time)) = (lineage, logical_time) {
            Some(ThnFilter::LineageAndLogicalTime(lin, time))
        } else if let Some(lin) = lineage {
            Some(ThnFilter::Lineage(lin))
        } else if let Some(time) = logical_time {
            Some(ThnFilter::LogicalTime(time))
        } else if let (Some(min), Some(max)) = (min_rowid, max_rowid) {
            Some(ThnFilter::Range(min, max))
        } else if let (Some(s), Some(t)) = (skip, take) {
            Some(ThnFilter::SkipAndTake(s, t))
        } else {
            None
        };

        let mut data = ThnData::default();
        if let Some(s) = select {
            for item in s {
                match item.as_str() {
                    "tensordata" => data.tensordata = true,
                    "clip" => data.clip = true,
                    "moodboard" => data.moodboard = true,
                    "legacy_prompts" => data.legacy_prompts = true,
                    _ => {}
                }
            }
        }

        let rows = dt_project
            .get_tensor_history_nodes(filter, Some(data))
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows)
    }
}
