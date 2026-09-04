use dtm_lib::projects_db::DtProjectRef;

mod tests {
    use std::{fs::File, io::prelude::Write, process::Command};

    use super::*;

    // These tests temporarilly disabld until test data is updated
    // #[tokio::test]
    // async fn build_single_graph() -> anyhow::Result<()> {
    //     let project = DtProjectRef::Path("/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/posetest.sqlite3".to_string());
    //     let dtp = project.open_project().await?;
    //     let graph = dtp.get_history_graph().await?;

    //     File::create("test_data/nodes.txt")?
    //         .write_all(serde_json::to_string(&graph)?.as_bytes())?;
    //     Ok(())
    // }

    // #[tokio::test]
    // async fn build_dot_graph() -> anyhow::Result<()> {
    //     let project = DtProjectRef::Path("/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/chroma up.sqlite3".to_string());
    //     let dtp = project.open_project().await?;
    //     let graph = dtp.get_history_graph().await?;

    //     let dot_output = graph.to_dot();
    //     File::create("test_data/graph.dot")?.write_all(dot_output.as_bytes())?;
    //     Ok(())
    // }
}
