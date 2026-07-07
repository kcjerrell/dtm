use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use tokio::sync::{oneshot, Mutex, Notify, Semaphore};

use crate::dtp_service::{
    events::DTPEvent,
    jobs::{Job, JobContext, JobResult},
};

type JobId = u64;

#[derive(Clone, Debug, Default)]
pub enum JobStatus {
    #[default]
    Pending,
    Active,
    // Canceled,
    WaitingForSubtasks(isize),
    Complete,
    Failed(String),
}

#[derive(Clone, Debug, Default)]
struct JobState {
    id: JobId,
    parent_id: Option<JobId>,
    status: JobStatus,
    jobs_failed: isize,
    jobs_completed: isize,
}

struct JobEntry {
    job: Arc<dyn Job>,
    state: JobState,
    /// When set, the job's final result is reported here once it (and all of its
    /// subtasks) resolve. Used by `add_job_front_and_wait` to await a job.
    on_done: Option<oneshot::Sender<anyhow::Result<()>>>,
}

#[derive(Clone)]
pub struct Scheduler {
    queue: Arc<Mutex<VecDeque<JobId>>>,
    notify: Arc<Notify>,
    jobs: Arc<Mutex<HashMap<JobId, JobEntry>>>,
    next_id: Arc<AtomicU64>,
    ctx: Arc<JobContext>,
    worker_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl Scheduler {
    pub fn new(ctx: Arc<JobContext>) -> Self {
        let semaphore = Arc::new(Semaphore::new(4));
        let scheduler = Scheduler {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            notify: Arc::new(Notify::new()),
            ctx,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(0)),
            worker_handle: Arc::new(std::sync::Mutex::new(None)),
        };

        let handle = tokio::spawn({
            let semaphore = semaphore.clone();
            let scheduler = scheduler.clone();

            async move {
                loop {
                    let next = { scheduler.queue.lock().await.pop_front() };
                    match next {
                        Some(job_id) => {
                            let permit = semaphore.clone().acquire_owned().await.unwrap();
                            let scheduler = scheduler.clone();

                            tokio::spawn(async move {
                                scheduler.process(job_id).await;
                                drop(permit); // release worker slot
                            });
                        }
                        None => {
                            // Queue is empty; wait until a job is enqueued. `notify_one`
                            // stores a permit when called with no waiter, so a job pushed
                            // between the pop above and this await is not missed.
                            scheduler.notify.notified().await;
                        }
                    }
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
            JobStatus::Failed(e) => self.resolve_job(job_id, &self.ctx, Err(anyhow::anyhow!(e.clone()))).await,
            _ => {}
        };

        if let Some(subtasks) = subtasks {
            for subtask in subtasks {
                self.add_job_internal(subtask, Some(job_id), false, None)
                    .await;
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

        let tasks_remaining = {
            let mut jobs = self.jobs.lock().await;
            let Some(parent_job) = jobs.get_mut(&parent_id) else {
                return None;
            };
            let tasks_remaining = match job_entry.state.status {
                JobStatus::Complete | JobStatus::Failed(_) => {
                    self.decrement_subtask_count(&mut parent_job.state)
                }
                _ => self.get_subtask_count(&parent_job.state),
            };
            match job_entry.state.status {
                JobStatus::Complete => parent_job.state.jobs_completed += 1,
                JobStatus::Failed(_) => parent_job.state.jobs_failed += 1,
                _ => {}
            }
            tasks_remaining
        };

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
        result: anyhow::Result<JobResult>,
    ) -> (JobStatus, Option<DTPEvent>, Option<Vec<Arc<dyn Job>>>) {
        let result = match result {
            Ok(r) => r,
            Err(e) => {
                return (JobStatus::Failed(format!("{:#}", e)), None, None);
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
    async fn resolve_job(&self, job_id: JobId, ctx: &JobContext, result: anyhow::Result<()>) {
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
                    entry.state.status = JobStatus::Complete;
                    entry.job.on_complete(ctx).await;
                    if entry.state.jobs_failed + entry.state.jobs_completed > 0 {
                        log::debug!(
                            "[Scheduler] Finished job: {} and {} subtasks",
                            entry.job.get_label(),
                            entry.state.jobs_failed + entry.state.jobs_completed
                        );
                    } else {
                        log::debug!("[Scheduler] Finished job: {}", entry.job.get_label(),);
                    }
                }
                Err(error) => {
                    let error_str = format!("{:#}", error);
                    entry.state.status = JobStatus::Failed(error_str.clone());
                    log::warn!(
                        "[Scheduler] Failed job: {} ({}) {}",
                        entry.job.get_label(),
                        entry.state.id,
                        error_str
                    );
                    entry.job.on_failed(ctx, error_str.clone()).await;
                }
            }

            // Notify any caller awaiting this specific job (see add_job_front_and_wait).
            if let Some(done) = entry.on_done.take() {
                let _ = done.send(current_result);
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
            this.add_job_internal(job, None, false, None).await;
        });
    }

    /// Inserts a job at the front of the queue and waits until it (and all of its
    /// subtasks) complete or fail, returning the job's final result.
    ///
    /// This lets callers run a normally-passive job (e.g. a project sync) on demand
    /// and block on its completion before continuing.
    pub async fn add_job_front_and_wait<T: Job + 'static>(&self, job: T) -> anyhow::Result<()> {
        let (tx, rx) = oneshot::channel();
        self.add_job_internal(Arc::new(job), None, true, Some(tx))
            .await;
        rx.await
            .context("Job was dropped before completion")?
    }

    async fn add_job_internal(
        &self,
        job: Arc<dyn Job>,
        parent_id: Option<JobId>,
        front: bool,
        on_done: Option<oneshot::Sender<anyhow::Result<()>>>,
    ) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let entry = JobEntry {
            job,
            state: JobState {
                id,
                parent_id,
                status: JobStatus::Pending,
                ..Default::default()
            },
            on_done,
        };
        // Insert into the job map before enqueuing so the worker always finds it.
        let _ = { self.jobs.lock().await.insert(id, entry) };
        {
            let mut queue = self.queue.lock().await;
            if front {
                queue.push_front(id);
            } else {
                queue.push_back(id);
            }
        }
        self.notify.notify_one();
    }
}
