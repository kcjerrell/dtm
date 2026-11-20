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

#[tokio::test]
async fn failed_descendants_fail_awaited_ancestors() {
    use common::*;
    use dtm_lib::dtp_service::{AppHandleWrapper, DTPService};
    let dtp = DTPService::new(AppHandleWrapper::new(None));
    let (events, channel) = EventHelper::new();
    dtp.connect(channel, false, "sqlite::memory:".into())
        .await
        .unwrap();
    let scheduler = dtp.scheduler.read().await.clone().unwrap();
    let result = scheduler
        .add_job_front_and_wait(TestJob::new(1, 0).with_subtasks(vec![
            TestJob::new(2, 0).with_subtask(TestJob::new(3, 0).with_fail()),
            TestJob::new(4, 0),
        ]))
        .await;
    assert_eq!(result, Err("TestJob failed".into()));
    assert_eq!(events.count("test_event_failed"), 3);
    assert_eq!(events.count("test_event_complete"), 1);
    dtp.stop().await;
    assert!(scheduler
        .add_job_front_and_wait(TestJob::new(5, 0))
        .await
        .is_err());
}

#[tokio::test]
async fn folder_leases_cover_descendants_and_stop_drains_workers() {
    use common::*;
    use dtm_lib::dtp_service::{
        jobs::{Job, JobContext, JobResult},
        AppHandleWrapper, DTPService,
    };
    use std::sync::Arc;
    use tokio::sync::{Notify, Semaphore};
    struct GateJob {
        folder: i64,
        started: Arc<Notify>,
        gate: Arc<Semaphore>,
        child: bool,
    }
    #[async_trait::async_trait]
    impl Job for GateJob {
        fn get_label(&self) -> String {
            "gate".into()
        }
        async fn folder_scope(&self, _: &JobContext) -> Result<Option<i64>, String> {
            Ok(Some(self.folder))
        }
        async fn execute(&self, _: &JobContext) -> Result<JobResult, String> {
            if !self.child {
                return Ok(JobResult::Subtasks(vec![Arc::new(Self {
                    folder: self.folder,
                    started: self.started.clone(),
                    gate: self.gate.clone(),
                    child: true,
                })]));
            }
            self.started.notify_one();
            self.gate.acquire().await.unwrap().forget();
            Ok(JobResult::None)
        }
    }
    let dtp = DTPService::new(AppHandleWrapper::new(None));
    let (_, channel) = EventHelper::new();
    dtp.connect(channel, false, "sqlite::memory:".into())
        .await
        .unwrap();
    let scheduler = dtp.scheduler.read().await.clone().unwrap();
    let started = Arc::new(Notify::new());
    let gate = Arc::new(Semaphore::new(0));
    let first = tokio::spawn({
        let scheduler = scheduler.clone();
        let started = started.clone();
        let gate = gate.clone();
        async move {
            scheduler
                .add_job_front_and_wait(GateJob {
                    folder: 1,
                    started,
                    gate,
                    child: false,
                })
                .await
        }
    });
    started.notified().await;
    let second_started = Arc::new(Notify::new());
    let second = tokio::spawn({
        let scheduler = scheduler.clone();
        let started = second_started.clone();
        async move {
            scheduler
                .add_job_front_and_wait(GateJob {
                    folder: 1,
                    started,
                    gate: Arc::new(Semaphore::new(1)),
                    child: true,
                })
                .await
        }
    });
    // A different folder can finish while the first folder's child is blocked.
    scheduler
        .add_job_front_and_wait(GateJob {
            folder: 2,
            started: Arc::new(Notify::new()),
            gate: Arc::new(Semaphore::new(1)),
            child: true,
        })
        .await
        .unwrap();
    assert!(!second.is_finished());
    let stop = tokio::spawn({
        let dtp = dtp.clone();
        async move { dtp.stop().await }
    });
    gate.add_permits(1);
    first.await.unwrap().unwrap();
    // If shutdown won admission, the second request is explicitly rejected.
    let _ = second.await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), stop)
        .await
        .unwrap()
        .unwrap();
    assert!(scheduler
        .add_job_front_and_wait(TestJob::new(8, 0))
        .await
        .is_err());
}
