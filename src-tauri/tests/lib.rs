mod common;

#[cfg(test)]
mod tests {
    use dtm_lib::dtp_service::AppHandleWrapper;
    use dtm_lib::dtp_service::DTPService;

    use crate::common::projects::WATCHFOLDER_A;
    use crate::common::*;

    #[tokio::test]
    async fn projects_test() {
        reset_db();
        let app_handle = AppHandleWrapper::new(None);
        let dtp_service = DTPService::new(app_handle);

        let (event_helper, channel) = EventHelper::new();
        let _ = dtp_service.connect(channel, true, None).await;

        let wfs = dtp_service.list_watch_folders().await;
        assert!(wfs.is_ok());
        assert_eq!(wfs.unwrap().len(), 0);

        let _ = dtp_service
            .add_watchfolder(
                WATCHFOLDER_A.to_string(),
                format!("TESTBOOKMARK::{}", WATCHFOLDER_A),
            )
            .await;

        let wfs = dtp_service.list_watch_folders().await;
        assert!(wfs.is_ok());
        assert_eq!(wfs.unwrap().len(), 1);

        println!("Wait for 1 project_added events");
        event_helper.assert_count("project_added", 1).await;
        println!("Events received!");

        println!("Stopping scheduler");
        let scheduler = dtp_service.scheduler.write().await.take();
        if let Some(s) = scheduler {
            s.stop().await;
        }
        println!("Scheduler stopped");

        println!("Stopping watch");
        let watch = dtp_service.watch.write().await.take();
        if let Some(w) = watch {
            let _ = w.stop_all().await;
        }
        println!("Watch stopped");
    }
}
