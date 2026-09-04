use std::{
    future::Future,
    pin::Pin,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

type BoxFuture = Pin<Box<dyn Future<Output = ()> + Send>>;
type Task = dyn Fn() -> BoxFuture + Send + Sync;

#[derive(derive_debug_extras::DebugExtras, Clone)]
pub struct DebounceTask {
    pub delay_ms: u32,
    counter: Arc<AtomicU64>,
    #[debug_ignore]
    task: Arc<Task>,
}

impl DebounceTask {
    /// The task should handle its own errors and return () since propogation is not possible
    pub fn new<F, Fut>(delay_ms: u32, task: F) -> Self
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        Self {
            delay_ms,
            counter: Arc::new(AtomicU64::new(0)),
            task: Arc::new(move || Box::pin(task())),
        }
    }

    pub fn call(&self) {
        let generation = self.counter.fetch_add(1, Ordering::Release) + 1;
        let counter = self.counter.clone();
        let task = self.task.clone();
        let delay = self.delay_ms;

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(delay as u64)).await;
            if generation == counter.load(Ordering::Acquire) {
                task().await;
            }
        });
    }
}
