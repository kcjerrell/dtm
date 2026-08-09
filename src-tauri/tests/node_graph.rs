use dtm_lib::dt_project::HistoryGraph;
use dtm_lib::projects_db::DtProjectRef;
use std::path::Path;

mod tests {
    use super::*;

    #[tokio::test]
    async fn build_single_graph() -> anyhow::Result<()> {
        let project = DtProjectRef::Path("/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/lineage5.sqlite3".to_string());
        let dtp = project.open_project().await?;
        let nodes = dtp.get_node_lineages().await?;
        let mut graph = HistoryGraph::new();

        for node in nodes {
            graph.add_node(node);
        }

        graph.resolve_parents();

        graph.save_graph("test_data/single_graph.svg")?;
        Ok(())
    }

    #[tokio::test]
    async fn build_graphs_for_folder() -> anyhow::Result<()> {
        return Ok(());
        let projects_dir =
            Path::new("/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents");
        let mut processed_count = 0;

        if let Ok(entries) = std::fs::read_dir(projects_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("sqlite3") {
                    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("graph");

                    println!("Processing: {}", path.display());

                    let project = DtProjectRef::Path(path.to_string_lossy().to_string());
                    match project.open_project().await {
                        Ok(dtp) => match dtp.get_node_lineages().await {
                            Ok(nodes) => {
                                let mut graph = HistoryGraph::new();

                                for node in nodes {
                                    graph.add_node(node);
                                }

                                graph.resolve_parents();

                                let (found, ambiguous, unknown) = graph.stats();
                                println!("  resolved: {found}, ambiguous: {ambiguous}, unknown: {unknown}");

                                let svg_path = format!("test_data/{}.svg", stem);
                                match graph.save_graph(&svg_path) {
                                    Ok(_) => {
                                        println!("  Saved graph: {}", stem);
                                        processed_count += 1;
                                    }
                                    Err(e) => {
                                        eprintln!("  Failed to save graph for {}: {}", stem, e);
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("  Failed to get node lineages for {}: {}", stem, e);
                            }
                        },
                        Err(e) => {
                            eprintln!("  Failed to open project {}: {}", stem, e);
                        }
                    }
                }
            }
        }

        if processed_count == 0 {
            anyhow::bail!("No SQLite files were successfully processed");
        }

        Ok(())
    }
}
