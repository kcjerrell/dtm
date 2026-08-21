use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct Instants {
    last: Arc<Mutex<Instant>>,
}

impl Instants {
    pub fn new() -> Self {
        Self {
            last: Arc::new(Mutex::new(Instant::now())),
        }
    }

    pub fn record(&self) -> u64 {
        let mut last = self.last.lock().unwrap();
        let elapsed = last.elapsed().as_micros() as u64;
        *last = Instant::now();
        elapsed
    }
}
