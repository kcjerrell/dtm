pub struct UpdateGate {
    pub total: usize,
    pub current: usize,
    pub updates: usize,
}

impl UpdateGate {
    pub fn new(total: usize, updates: usize) -> Self {
        Self {
            total,
            current: 0,
            updates,
        }
    }

    pub fn update(&mut self, count: usize) -> bool {
        // determine the next breakpoint
        let interval = self.total / self.updates;

        let next_breakpoint = self.current.div_ceil(interval) * interval;
        // if we are at 36 and interval is 10, next breakpoint is 40
        // 36 div_ceil 10 = 4, 4 * 10 = 40

        self.current += count;

        self.current >= next_breakpoint
    }

    pub fn prog(&self) -> String {
        let p = self.current as f64 / self.total as f64 * 100.0;
        format!("{:.0}%", p)
    }
}
