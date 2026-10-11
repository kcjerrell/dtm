mod common;

#[cfg(test)]
mod tests {

    use std::fs;

    use crate::common::*;

    #[tokio::test]
    async fn sync_projects_no_watch() {
        let (dtps, event_helper, wfh, db_path) = test_fixture(false, false).await;

        // `connect` queues an initial sync. Let it finish before adding a folder,
        // otherwise both sync jobs can discover and scan the newly-added folder.
        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        event_helper.reset_counts();

        // add empty watch folder
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 0);
        event_helper.reset_counts();

        // copy projects and sync
        wfh.copy_all();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        dtps.stop().await;

        fs::copy(db_path, "test_data/testdb.db").unwrap();
    }
}
