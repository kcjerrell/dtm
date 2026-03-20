use crate::dtp_service::jobs::{Job, JobContext, JobResult};

pub struct ExampleJob {
    pub data: String,
}

impl ExampleJob {
    pub fn new(data: String) -> Self {
        Self { data }
    }
}

#[async_trait::async_trait]
impl Job for ExampleJob {
    fn get_label(&self) -> String {
        "Example job".to_string()
    }

    // optional
    // fn start_event(self: &Self) -> Option<DTPEvent> { None }

    // optional
    // async fn on_complete(&self, _ctx: &JobContext) {}

    // optional
    // async fn on_failed(&self, _ctx: &JobContext, _error: String) {}

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        Ok(JobResult::None)
    }
}
