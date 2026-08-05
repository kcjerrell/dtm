use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
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
        if self.current >= self.total {
            return false;
        }

        self.current = self.total.min(self.current + count);

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

pub struct UpdateData {
    pub step: usize,
    pub total_steps: usize,
    pub progress: f64,
    pub percent: u8,
}

#[derive(Debug, Clone)]
pub struct PrintUpdate {
    pub gate: Arc<Mutex<UpdateGate>>,
    message_pre: String,
    message_post: String,
}

impl PrintUpdate {
    pub fn new(total: usize, updates: usize, message_pre: &str, message_post: &str) -> Arc<Self> {
        Arc::new(Self {
            gate: UpdateGate::new(total, updates),
            message_pre: message_pre.to_string(),
            message_post: message_post.to_string(),
        })
    }

    pub fn update(&self, count: usize) -> bool {
        if self.gate.update(count) {
            println!(
                "{} {} / {} ({})",
                self.message_pre,
                self.gate.current(),
                self.gate.total(),
                self.gate.prog()
            );
            true
        } else {
            false
        }
    }
}

mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI32, Ordering};
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_update_gate() {
        let updater = PrintUpdate::new(100, 5, "Test", "");

        for i in 0..100 {
            updater.update(1);
        }
    }
}
