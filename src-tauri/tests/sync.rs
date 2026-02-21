mod common;

#[cfg(test)]
mod tests {

    use crate::common::*;

    #[tokio::test]
    async fn sync_projects_no_watch() {
        let (dtps, event_helper, wfh) = test_fixture(false).await;

        // add empty watch folder
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();

        event_helper.assert_count("folder_sync_complete", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 0);
        event_helper.reset_counts();

        // copy projects and sync
        wfh.copy_all();
        let _ = dtps.sync().await;

        event_helper.assert_count("folder_sync_complete", 1).await;
        event_helper.assert_count("project_added", 2).await;
        event_helper.assert_count("project_updated", 2).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();
        let _ = dtps.sync().await;

        event_helper.assert_count("folder_sync_complete", 1).await;
        event_helper.assert_count("project_removed", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();
        let _ = dtps.sync().await;

        event_helper.assert_count("folder_sync_complete", 1).await;
        event_helper.assert_count("project_updated", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }

    #[tokio::test]
    async fn sync_projects_with_watch() {
        let (dtps, event_helper, wfh) = test_fixture(true).await;

        // add empty watch folder
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();

        event_helper.assert_count("folder_sync_complete", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 0);
        event_helper.reset_counts();

        // copy projects and sync
        wfh.copy_all();

        event_helper.assert_count("project_added", 2).await;
        event_helper.assert_count("project_updated", 2).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();

        event_helper.assert_count("project_removed", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();

        event_helper.assert_count("project_updated", 1).await;
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }
}
