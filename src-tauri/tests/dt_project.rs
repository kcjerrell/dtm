mod common;

#[cfg(test)]
mod tests {
    use dtm_lib::projects_db::dt_project::{DTProject, ThnData, ThnFilter};

    #[tokio::test]
    async fn test_tensor_history_node() -> Result<(), Box<dyn std::error::Error>> {
        let dt_project = DTProject::open("../test_data/projects/test-project-a2.sqlite3").await?;

        let nodes = dt_project
            .get_tensor_history_nodes(
                Some(ThnFilter::FirstAndTake(0, 5)),
                Some(ThnData::tensordata()),
            )
            .await?;

        println!("{:?}", nodes[0].tensordata);

        Ok(())
    }
}
