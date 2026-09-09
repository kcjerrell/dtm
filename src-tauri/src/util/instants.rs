use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

    pub fn record(&self) -> Duration {
        let now = Instant::now();
        let mut last = self.last.lock().unwrap();
        let elapsed = now - *last;
        *last = now;
        elapsed
    }
}

#[derive(Debug, Clone)]
pub struct InstantsTotal {
    state: Arc<Mutex<(Instant, Duration)>>,
}

impl InstantsTotal {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new((Instant::now(), Duration::ZERO))),
        }
    }

    pub fn on(&self) {
        let now = Instant::now();
        let mut state = self.state.lock().unwrap();
        let (_, total) = *state;
        *state = (now, total);
    }

    pub fn off(&mut self) {
        let now = Instant::now();
        let mut state = self.state.lock().unwrap();
        let (last, total) = *state;
        *state = (now, total + now.duration_since(last));
    }

    pub fn get_total(&self) -> Duration {
        self.state.lock().unwrap().1
    }
}
