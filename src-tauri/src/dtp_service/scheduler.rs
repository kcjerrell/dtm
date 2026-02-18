use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use tokio::sync::{mpsc, Mutex, Semaphore};

use crate::dtp_service::{
    events::DTPEvent,
    jobs::{Job, JobContext, JobResult},
};

type JobId = u64;

#[derive(Clone, Debug)]
pub enum JobStatus {
    Pending,
    Active,
    Canceled,
    WaitingForSubtasks(isize),
    Complete,
    Failed(String),
}

#[derive(Clone, Debug)]
struct JobState {
    id: JobId,
    parent_id: Option<JobId>,
    status: JobStatus,
}

#[derive(Clone)]
struct JobEntry {
    job: Arc<dyn Job>,
    state: JobState,
}

#[derive(Clone)]
pub struct Scheduler {
    tx: mpsc::Sender<JobId>,
    jobs: Arc<Mutex<HashMap<JobId, JobEntry>>>,
    next_id: Arc<AtomicU64>,
    ctx: JobContext,
}

impl Scheduler {
    pub fn new(ctx: &JobContext) -> Self {
        let (tx, mut rx) = mpsc::channel::<JobId>(10000);

        let semaphore = Arc::new(Semaphore::new(4));
        let scheduler = Scheduler {
            tx,
            ctx: ctx.clone(),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(0)),
        };

        tokio::spawn({
            let semaphore = semaphore.clone();
            let scheduler = scheduler.clone();

            async move {
                while let Some(job_id) = rx.recv().await {
                    let permit = semaphore.clone().acquire_owned().await.unwrap();
                    let scheduler = scheduler.clone();

                    tokio::spawn(async move {
                        scheduler.process(job_id).await;
                        drop(permit); // release worker slot
                    });
                }
            }
        });

        scheduler
    }

    async fn process(&self, job_id: JobId) {
        // get the job, updating its status along the way
        let job: Arc<dyn Job> = {
            let mut jobs = self.jobs.lock().await;
            let entry = jobs.get_mut(&job_id).unwrap();
            entry.state.status = JobStatus::Active;
            entry.job.clone()
        };

        let label = job.get_label();
        log::debug!("[Scheduler] Starting job: {}", label);

        // emit start event
        if let Some(event) = job.start_event() {
            self.ctx.events.emit(event);
        }

        // execute job
        let result = job.execute(&self.ctx).await;

        let (next_status, event, subtasks) = self.handle_result(result).await;

        match &next_status {
            JobStatus::WaitingForSubtasks(count) => self.shelve_job(job_id, count).await,
            JobStatus::Complete => self.finish_job(job_id, &self.ctx).await,
            JobStatus::Failed(e) => self.fail_job(job_id, &self.ctx, e.to_string()).await,
            _ => {}
        };

        if let Some(subtasks) = subtasks {
            for subtask in subtasks {
                self.add_job_internal(subtask, Some(job_id)).await;
            }
        }

        if let Some(event) = event {
            self.ctx.events.emit(event);
        }
    }

    async fn update_parent_job(&self, job_entry: &JobEntry, ctx: &JobContext) -> Option<JobId> {
        if job_entry.state.parent_id.is_none() {
            return None;
        }
        let parent_id = job_entry.state.parent_id.unwrap();

        let (tasks_remaining, label) = {
            let mut jobs = self.jobs.lock().await;
            let job = jobs.get_mut(&parent_id).unwrap();
            let tasks_remaining = match job_entry.state.status {
                JobStatus::Complete => self.decrement_subtask_count(&mut job.state),
                JobStatus::Failed(_) => self.decrement_subtask_count(&mut job.state),
                _ => self.get_subtask_count(&job.state),
            };
            (tasks_remaining, job.job.get_label())
        };

        log::debug!(
            "[Scheduler] Tasks remaining: {} for job: {}",
            tasks_remaining,
            label
        );

        if tasks_remaining < 0 {
            log::error!(
                "[Scheduler] Tasks remaining is negative: {} ({})",
                label,
                tasks_remaining
            );
        }
        if tasks_remaining <= 0 {
            Some(parent_id)
        } else {
            None
        }
    }

    fn decrement_subtask_count(&self, state: &mut JobState) -> isize {
        if let JobStatus::WaitingForSubtasks(tasks_remaining) = state.status {
            state.status = JobStatus::WaitingForSubtasks(tasks_remaining - 1);
            tasks_remaining - 1
        } else {
            0
        }
    }

    fn get_subtask_count(&self, state: &JobState) -> isize {
        if let JobStatus::WaitingForSubtasks(tasks_remaining) = state.status {
            tasks_remaining
        } else {
            0
        }
    }

    async fn handle_result(
        &self,
        result: Result<JobResult, String>,
    ) -> (JobStatus, Option<DTPEvent>, Option<Vec<Arc<dyn Job>>>) {
        let result = match result {
            Ok(r) => r,
            Err(e) => {
                return (JobStatus::Failed(e.clone()), None, None);
            }
        };

        let (status, event, subtasks) = match result {
            JobResult::Event(event) => (JobStatus::Complete, Some(event), None),
            JobResult::None => (JobStatus::Complete, None, None),
            JobResult::Subtasks(subtasks) => (
                JobStatus::WaitingForSubtasks(subtasks.len() as isize),
                None,
                Some(subtasks),
            ),
        };

        (status, event, subtasks)
    }

    /// also updates parent job
    async fn finish_job(&self, job_id: JobId, ctx: &JobContext) {
        let mut current_id = Some(job_id);
        while let Some(id) = current_id {
            log::debug!("[Scheduler] Finishing job: {}", id);
            let mut entry = {
                let mut jobs = self.jobs.lock().await;
                jobs.remove(&id).unwrap()
            };
            entry.state.status = JobStatus::Complete;
            entry.job.on_complete(ctx).await;

            log::debug!(
                "[Scheduler] Finished job: {} ({})",
                entry.job.get_label(),
                entry.state.id
            );

            current_id = self.update_parent_job(&entry, ctx).await;
        }
    }

    /// also updates parent job
    async fn fail_job(&self, job_id: JobId, ctx: &JobContext, error: String) {
        let mut current_id = Some(job_id);
        let mut current_error = error;
        while let Some(id) = current_id {
            let mut entry = {
                let mut jobs = self.jobs.lock().await;
                jobs.remove(&id).unwrap()
            };
            entry.state.status = JobStatus::Failed(current_error.clone());
            log::warn!(
                "[Scheduler] Failed job: {} ({}) {}",
                entry.job.get_label(),
                entry.state.id,
                current_error
            );
            entry.job.on_failed(ctx, current_error.clone()).await;
            current_id = self.update_parent_job(&entry, ctx).await;
            // if we have a parent to finish, we treat it as a success for the chain update logic
            // (or rather, we just continue the chain). If you want parents to fail if subtasks fail,
            // that would be a different logic change.
        }
    }

    async fn shelve_job(&self, job_id: JobId, subtasks_remaining: &isize) {
        let mut jobs = self.jobs.lock().await;
        let entry = jobs.get_mut(&job_id).unwrap();
        entry.state.status = JobStatus::WaitingForSubtasks(*subtasks_remaining);
    }

    pub async fn add_job<T: Job>(&self, job: T)
    where
        T: Job + 'static,
    {
        self.add_job_internal(Arc::new(job), None).await;
    }

    async fn add_job_internal(&self, job: Arc<dyn Job>, parent_id: Option<JobId>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        println!("[Scheduler] Adding job: {}", job.get_label());
        let entry = JobEntry {
            job,
            state: JobState {
                id,
                parent_id,
                status: JobStatus::Pending,
            },
        };
        let _ = { self.jobs.lock().await.insert(id, entry) };
        let _ = self.tx.send(id).await;
    }
}
