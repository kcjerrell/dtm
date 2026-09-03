mod common;

#[cfg(test)]
mod tests {

    use crate::common::*;

    static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[tokio::test]
    async fn sync_projects_no_watch() {
        let _guard = TEST_MUTEX.lock().await;
        let (dtps, event_helper, wfh, _) = test_fixture(false, false).await;

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
        assert!(event_helper.wait_for_count("project_added", 2).await);
        assert!(event_helper.wait_for_count("project_updated", 2).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        assert!(event_helper.wait_for_count("project_removed", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        assert!(event_helper.wait_for_count("project_updated", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }

    #[tokio::test]
    async fn sync_projects_with_watch() {
        let _guard = TEST_MUTEX.lock().await;
        let (dtps, event_helper, wfh, _) = test_fixture(true, false).await;

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

        assert!(event_helper.wait_for_count("project_added", 2).await);
        assert!(event_helper.wait_for_count("project_updated", 2).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();

        assert!(event_helper.wait_for_count("project_removed", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();

        assert!(event_helper.wait_for_count("project_updated", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }
}
