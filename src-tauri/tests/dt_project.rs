mod common;

#[cfg(test)]
mod tests {
    use dtm_lib::dt_project::{ThnData, ThnFilter};

    #[tokio::test]
    async fn test_tensor_history_node() -> Result<(), Box<dyn std::error::Error>> {
        let dt_project = dtm_lib::projects_db::DtProjectRef::Path(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/test_data/projects/test-project-a2.sqlite3"
            )
            .to_string(),
        )
        .open_project()
        .await?;

        let nodes = dt_project
            .get_tensor_history_nodes(
                Some(ThnFilter::SkipAndTake(0, 5)),
                Some(ThnData::tensordata()),
            )
            .await?;

        assert_eq!(nodes.len(), 5);
        assert!(nodes.iter().all(|node| node.tensordata.is_some()));

        Ok(())
    }
}
