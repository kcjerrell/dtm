mod common;

#[cfg(test)]
mod tests {
    use dtm_lib::dtp_service::AppHandleWrapper;
    use dtm_lib::dtp_service::DTPService;

    use crate::common::*;
    
    #[tokio::test]
    async fn projects_test() {
        reset_db();
        let app_handle = AppHandleWrapper::new(None);
        let dtp_service = DTPService::new(app_handle);

        let (event_helper, channel) = EventHelper::new();
        let _ = dtp_service.connect(channel).await;

        let wfs = dtp_service.list_watch_folders().await;
        assert!(wfs.is_ok());
        assert_eq!(wfs.unwrap().len(), 0);

        let _ = dtp_service
            .add_watchfolder(
                format!("{}/projects", TEST_DATA_PATH),
                format!("TESTBOOKMARK::{}/projects", TEST_DATA_PATH),
            )
            .await;

        let wfs = dtp_service.list_watch_folders().await;
        assert!(wfs.is_ok());
        assert_eq!(wfs.unwrap().len(), 1);

        event_helper.assert_count("project_added", 2).await;
    }
}
