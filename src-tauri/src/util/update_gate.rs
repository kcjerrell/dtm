use std::sync::{Arc, Mutex};

pub struct UpdateGate {
    pub total: usize,
    pub current: usize,
    pub updates: usize,
    next_update: usize,
}

impl UpdateGate {
    pub fn new(total: usize, updates: usize) -> Arc<Mutex<Self>> {
        assert!(updates > 0, "updates must be greater than 0");
        assert!(total > 0, "total must be greater than 0");

        Arc::new(Mutex::new(Self {
            total,
            current: 0,
            updates,
            next_update: total / updates,
        }))
    }

    fn update_inner(&mut self, count: usize) -> bool {
        self.current += count;

        if self.current <= self.next_update {
            return false;
        }

        while self.current > self.next_update {
            self.next_update += self.total / self.updates;
        }

        true
    }

    pub fn prog(&self) -> String {
        let p = self.current as f64 / self.total as f64 * 100.0;
        format!("{:.0}%", p)
    }
}

pub trait UpdateGateExt {
    fn update(&self, count: usize) -> bool;
    fn current(&self) -> usize;
    fn total(&self) -> usize;
    fn prog(&self) -> String;
}

impl UpdateGateExt for Arc<Mutex<UpdateGate>> {
    fn update(&self, count: usize) -> bool {
        self.lock().unwrap().update_inner(count)
    }

    fn current(&self) -> usize {
        self.lock().unwrap().current
    }

    fn total(&self) -> usize {
        self.lock().unwrap().total
    }

    fn prog(&self) -> String {
        self.lock().unwrap().prog()
    }
}
