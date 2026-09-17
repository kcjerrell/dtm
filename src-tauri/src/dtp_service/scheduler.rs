use crate::dtp_service::{
    events::DTPEvent,
    jobs::{Job, JobContext, JobResult},
};
use futures_util::FutureExt;
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
};
use tokio::sync::{oneshot, Mutex, Notify};
use tokio::task::JoinSet;

type JobId = u64;
struct JobEntry {
    job: Arc<dyn Job>,
    parent: Option<JobId>,
    remaining: usize,
    failure: Option<String>,
    admission_error: Option<String>,
    // A folder lease belongs to the first job in the tree that requests it.
    // Descendants inherit it, so they never wait on their own parent.
    scope: Option<(i64, JobId)>,
    on_done: Option<oneshot::Sender<Result<(), String>>>,
}
#[derive(Default)]
struct State {
    queue: VecDeque<JobId>,
    jobs: HashMap<JobId, JobEntry>,
    leases: HashMap<i64, JobId>,
    next_id: JobId,
    stopped: bool,
}
#[derive(Clone)]
pub struct Scheduler {
    state: Arc<Mutex<State>>,
    notify: Arc<Notify>,
    ctx: Arc<JobContext>,
    worker: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}
impl Scheduler {
    pub fn new(ctx: Arc<JobContext>) -> Self {
        let scheduler = Self {
            state: Arc::new(Mutex::new(State::default())),
            notify: Arc::new(Notify::new()),
            ctx,
            worker: Arc::new(Mutex::new(None)),
        };
        let runner = scheduler.clone();
        *scheduler.worker.try_lock().unwrap() =
            Some(tokio::spawn(async move { runner.run().await }));
        scheduler
    }

    async fn run(&self) {
        let mut workers = JoinSet::new();
        loop {
            let next = {
                let mut state = self.state.lock().await;
                if state.stopped && state.jobs.is_empty() && workers.is_empty() {
                    break;
                }
                if workers.len() < 4 {
                    let index = state.queue.iter().position(|id| {
                        state.jobs[id].scope.is_none_or(|(folder, owner)| {
                            state
                                .leases
                                .get(&folder)
                                .is_none_or(|active| *active == owner)
                        })
                    });
                    index.map(|index| {
                        let id = state.queue.remove(index).unwrap();
                        if let Some((folder, owner)) = state.jobs[&id].scope {
                            state.leases.insert(folder, owner);
                        }
                        id
                    })
                } else {
                    None
                }
            };
            if let Some(id) = next {
                let scheduler = self.clone();
                workers.spawn(async move { scheduler.process(id).await });
                continue;
            }
            tokio::select! {
                _ = self.notify.notified() => {},
                result = workers.join_next(), if !workers.is_empty() => {
                    if let Some(Err(error)) = result { log::error!("Scheduler worker failed: {error}"); }
                }
            }
        }
    }

    /// Reject new roots, then drain all accepted work and its descendants. The
    /// database remains available until this returns; no worker is detached.
    pub async fn stop(&self) {
        self.state.lock().await.stopped = true;
        self.notify.notify_one();
        let mut worker = self.worker.lock().await;
        if let Some(handle) = worker.take() {
            let _ = handle.await;
        }
    }

    async fn process(&self, id: JobId) {
        let (job, admission_error) = {
            let state = self.state.lock().await;
            (
                state.jobs[&id].job.clone(),
                state.jobs[&id].admission_error.clone(),
            )
        };
        if let Some(event) = job.start_event() {
            self.ctx.events.emit(event);
        }
        let result = if let Some(error) = admission_error {
            Err(error)
        } else {
            std::panic::AssertUnwindSafe(job.execute(&self.ctx))
                .catch_unwind()
                .await
                .unwrap_or_else(|_| Err(format!("{} panicked", job.get_label())))
        };
        match result {
            Ok(JobResult::Subtasks(children)) if !children.is_empty() => {
                self.state.lock().await.jobs.get_mut(&id).unwrap().remaining = children.len();
                for child in children {
                    self.enqueue(child, Some(id), false, None).await;
                }
            }
            Ok(result) => {
                // Publish data before terminal events or an awaited result.
                if let JobResult::Event(event) = result {
                    self.ctx.events.emit(event);
                }
                self.resolve(id, Ok(())).await;
            }
            Err(error) => self.resolve(id, Err(error)).await,
        }
    }

    async fn resolve(&self, mut id: JobId, mut result: Result<(), String>) {
        loop {
            let mut entry = self.state.lock().await.jobs.remove(&id).unwrap();
            let callback = async {
                match &result {
                    Ok(()) => entry.job.on_complete(&self.ctx).await,
                    Err(error) => entry.job.on_failed(&self.ctx, error.clone()).await,
                }
            };
            if std::panic::AssertUnwindSafe(callback)
                .catch_unwind()
                .await
                .is_err()
            {
                result = Err(format!(
                    "{} terminal callback panicked",
                    entry.job.get_label()
                ));
            }
            if let Err(error) = &result {
                log::error!("{}: {error}", entry.job.get_label());
                if entry.parent.is_none() {
                    self.ctx.events.emit(DTPEvent::SyncFailed(format!(
                        "{}: {error}",
                        entry.job.get_label()
                    )));
                }
            }
            if let Some(done) = entry.on_done.take() {
                let _ = done.send(result.clone());
            }
            let mut state = self.state.lock().await;
            if let Some((folder, owner)) = entry.scope {
                if owner == id {
                    state.leases.remove(&folder);
                }
            }
            self.notify.notify_one();
            let Some(parent_id) = entry.parent else { break };
            let parent = state.jobs.get_mut(&parent_id).unwrap();
            if let Err(error) = result {
                parent.failure.get_or_insert(error);
            }
            parent.remaining -= 1;
            if parent.remaining != 0 {
                break;
            }
            result = parent.failure.take().map_or(Ok(()), Err);
            id = parent_id;
        }
    }

    pub fn add_job<T: Job + 'static>(&self, job: T) {
        let scheduler = self.clone();
        tokio::spawn(async move {
            scheduler.enqueue(Arc::new(job), None, false, None).await;
        });
    }
    pub async fn add_job_front_and_wait<T: Job + 'static>(&self, job: T) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.enqueue(Arc::new(job), None, true, Some(tx)).await;
        rx.await
            .unwrap_or_else(|_| Err("Job was dropped before completion".into()))
    }
    async fn enqueue(
        &self,
        job: Arc<dyn Job>,
        parent: Option<JobId>,
        front: bool,
        on_done: Option<oneshot::Sender<Result<(), String>>>,
    ) {
        let (folder, admission_error) = match job.folder_scope(&self.ctx).await {
            Ok(folder) => (folder, None),
            Err(error) => (None, Some(error)),
        };
        let mut state = self.state.lock().await;
        if state.stopped && parent.is_none() {
            if let Some(done) = on_done {
                let _ = done.send(Err("Scheduler stopped".into()));
            }
            return;
        }
        let id = state.next_id;
        state.next_id += 1;
        let inherited = parent.and_then(|p| state.jobs[&p].scope);
        state.jobs.insert(
            id,
            JobEntry {
                job,
                parent,
                remaining: 0,
                failure: None,
                admission_error,
                scope: inherited.or_else(|| folder.map(|f| (f, id))),
                on_done,
            },
        );
        if front {
            state.queue.push_front(id);
        } else {
            state.queue.push_back(id);
        }
        self.notify.notify_one();
    }
}
