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
    tx: Arc<mpsc::Sender<JobId>>,
    jobs: Arc<Mutex<HashMap<JobId, JobEntry>>>,
    next_id: Arc<AtomicU64>,
    ctx: JobContext,
    worker_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl Scheduler {
    pub fn new(ctx: &JobContext) -> Self {
        let (tx, mut rx) = mpsc::channel::<JobId>(10000);

        let semaphore = Arc::new(Semaphore::new(4));
        let scheduler = Scheduler {
            tx: Arc::new(tx),
            ctx: ctx.clone(),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(0)),
            worker_handle: Arc::new(std::sync::Mutex::new(None)),
        };

        let handle = tokio::spawn({
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

        *scheduler.worker_handle.lock().unwrap() = Some(handle);

        scheduler
    }

    pub async fn stop(&self) {
        if let Some(handle) = self.worker_handle.lock().unwrap().take() {
            handle.abort();
        }
    }

    async fn process(&self, job_id: JobId) {
        // get the job, updating its status along the way
        let job: Arc<dyn Job> = {
            let mut jobs = self.jobs.lock().await;
            let Some(entry) = jobs.get_mut(&job_id) else {
                log::warn!("[Scheduler] Job {} not found during process", job_id);
                return;
            };
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
            JobStatus::Complete => self.resolve_job(job_id, &self.ctx, Ok(())).await,
            JobStatus::Failed(e) => self.resolve_job(job_id, &self.ctx, Err(e.clone())).await,
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

    async fn update_parent_job(&self, job_entry: &JobEntry, _ctx: &JobContext) -> Option<JobId> {
        if job_entry.state.parent_id.is_none() {
            return None;
        }
        let parent_id = job_entry.state.parent_id.unwrap();

        let (tasks_remaining, label) = {
            let mut jobs = self.jobs.lock().await;
            let Some(job) = jobs.get_mut(&parent_id) else {
                return None;
            };
            let tasks_remaining = match job_entry.state.status {
                JobStatus::Complete | JobStatus::Failed(_) => {
                    self.decrement_subtask_count(&mut job.state)
                }
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
        if tasks_remaining == 0 {
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
                match subtasks.len() {
                    0 => JobStatus::Complete,
                    _ => JobStatus::WaitingForSubtasks(subtasks.len() as isize),
                },
                None,
                Some(subtasks),
            ),
        };

        (status, event, subtasks)
    }

    /// Resolves a job, calling on_complete or on_failed, and updates its parent.
    /// If a parent completes all subtasks, it always resolves as successful,
    /// even if some subtasks failed.
    async fn resolve_job(&self, job_id: JobId, ctx: &JobContext, result: Result<(), String>) {
        let mut current_id = Some(job_id);
        let mut current_result = result;

        while let Some(id) = current_id {
            let mut entry = {
                let mut jobs = self.jobs.lock().await;
                let Some(entry) = jobs.remove(&id) else {
                    log::warn!("[Scheduler] Job {} not found during resolution", id);
                    break;
                };
                entry
            };

            match &current_result {
                Ok(_) => {
                    log::debug!("[Scheduler] Finishing job: {}", id);
                    entry.state.status = JobStatus::Complete;
                    entry.job.on_complete(ctx).await;
                    log::debug!(
                        "[Scheduler] Finished job: {} ({})",
                        entry.job.get_label(),
                        entry.state.id
                    );
                }
                Err(error) => {
                    entry.state.status = JobStatus::Failed(error.clone());
                    log::warn!(
                        "[Scheduler] Failed job: {} ({}) {}",
                        entry.job.get_label(),
                        entry.state.id,
                        error
                    );
                    entry.job.on_failed(ctx, error.clone()).await;
                }
            }

            current_id = self.update_parent_job(&entry, ctx).await;

            // Parent jobs always succeed when their subtasks finish,
            // regardless of whether this specific subtask failed.
            current_result = Ok(());
        }
    }

    async fn shelve_job(&self, job_id: JobId, subtasks_remaining: &isize) {
        let mut jobs = self.jobs.lock().await;
        if let Some(entry) = jobs.get_mut(&job_id) {
            entry.state.status = JobStatus::WaitingForSubtasks(*subtasks_remaining);
        } else {
            log::warn!("[Scheduler] Job {} not found during shelve", job_id);
        }
    }

    pub fn add_job<T: Job + 'static>(&self, job: T) {
        let job = Arc::new(job);
        let this = self.clone();
        tokio::spawn(async move {
            this.add_job_internal(job, None).await;
        });
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
