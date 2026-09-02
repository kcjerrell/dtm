mod common;

#[cfg(test)]
mod tests {
    use dtm_lib::dtp_service::AppHandleWrapper;
    use dtm_lib::dtp_service::DTPService;

    use crate::common::*;

    #[tokio::test]
    async fn schedule_jobs() {
        let app_handle = AppHandleWrapper::new(None);
        let dtp = DTPService::new(app_handle);

        let (event_helper, channel) = EventHelper::new();
        let _ = dtp
            .connect(channel, false, "sqlite::memory:".to_string())
            .await;

        // it can add and run jobs
        dtp.add_job(TestJob::new(1, 100));
        assert!(event_helper.wait_for_count("test_event_start", 1).await);
        assert!(event_helper.wait_for_count("test_event_complete", 1).await);

        // it can add and run concurrent jobs
        // the assumes concurrent threads are 4
        event_helper.reset_counts();
        let start_time = std::time::Instant::now();
        dtp.add_job(TestJob::new(2, 500));
        dtp.add_job(TestJob::new(3, 500));
        dtp.add_job(TestJob::new(4, 500));
        dtp.add_job(TestJob::new(5, 500));
        assert!(event_helper.wait_for_count("test_event_start", 4).await);
        assert!(event_helper.wait_for_count("test_event_complete", 0).await);
        assert!(event_helper.wait_for_count("test_event_complete", 4).await);
        let duration = start_time.elapsed();
        assert!(duration < std::time::Duration::from_millis(1000));

        // it can add and run jobs with subtasks
        event_helper.reset_counts();
        let start_time = std::time::Instant::now();
        dtp.add_job(
            TestJob::new(6, 500)
                .with_subtask(TestJob::new(7, 500).with_subtask(TestJob::new(8, 500))),
        );
        assert!(event_helper.wait_for_count("test_event_start", 3).await);
        assert!(event_helper.wait_for_count("test_event_complete", 3).await);
        assert!(start_time.elapsed() >= std::time::Duration::from_millis(1500));

        dtp.stop().await;
    }

    #[tokio::test]
    async fn schedule_jobs_with_failure() {
        let app_handle = AppHandleWrapper::new(None);
        let dtp_service = DTPService::new(app_handle);

        let (event_helper, channel) = EventHelper::new();
        let _ = dtp_service
            .connect(channel, false, "sqlite::memory:".to_string())
            .await;

        let scheduler = { dtp_service.scheduler.read().await.clone().unwrap().clone() };

        // it can add and run jobs with failure
        event_helper.reset_counts();
        scheduler.add_job(TestJob::new(1, 500).with_fail());
        assert!(event_helper.wait_for_count("test_event_start", 1).await);
        assert!(event_helper.wait_for_count("test_event_failed", 1).await);

        dtp_service.stop().await;
    }

    #[tokio::test]
    async fn await_job_at_front() {
        let app_handle = AppHandleWrapper::new(None);
        let dtp = DTPService::new(app_handle);

        let (event_helper, channel) = EventHelper::new();
        let _ = dtp
            .connect(channel, false, "sqlite::memory:".to_string())
            .await;

        let scheduler = { dtp.scheduler.read().await.clone().unwrap() };

        // it returns Ok only after the job has actually completed
        let result = scheduler.add_job_front_and_wait(TestJob::new(1, 100)).await;
        assert!(result.is_ok());
        assert!(event_helper.wait_for_count("test_event_complete", 1).await);

        // it surfaces the job's failure to the caller
        let result = scheduler
            .add_job_front_and_wait(TestJob::new(2, 50).with_fail())
            .await;
        assert_eq!(result, Err("TestJob failed".to_string()));
        assert!(event_helper.wait_for_count("test_event_failed", 1).await);

        // it waits for all subtasks to finish before returning
        event_helper.reset_counts();
        let start = std::time::Instant::now();
        scheduler
            .add_job_front_and_wait(TestJob::new(3, 100).with_subtask(TestJob::new(4, 300)))
            .await
            .unwrap();
        assert!(start.elapsed() >= std::time::Duration::from_millis(400));
        assert!(event_helper.wait_for_count("test_event_complete", 2).await);

        dtp.stop().await;
    }
}
