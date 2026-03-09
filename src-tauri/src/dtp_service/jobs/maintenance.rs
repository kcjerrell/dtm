use std::{collections::HashMap, sync::Arc};

use entity::{enums::Sampler, images, projects, watch_folders};
use num_enum::TryFromPrimitive;
use sea_orm::{
    ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, JoinType, QueryFilter,
    QuerySelect, RelationDef, RelationTrait,
};

use crate::{
    dtp_service::jobs::{CheckFolderJob, Job, JobContext, JobResult},
    projects_db::{dtos::watch_folder::WatchFolderDTO, maintenance::Maintenance},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, TryFromPrimitive)]
#[repr(u32)]
pub enum MaintenanceTaskKind {
    RescanTCDTrailing = 1,
}

static TASK_KINDS: &[MaintenanceTaskKind] = &[MaintenanceTaskKind::RescanTCDTrailing];

pub struct MaintenanceJob {
    pub kind: MaintenanceTaskKind,
    pub watchfolder: WatchFolderDTO,
    pub check: Option<Arc<CheckFolderJob>>,
}

impl MaintenanceJob {
    pub fn new(value: u32, watchfolder: WatchFolderDTO, check: Option<Arc<CheckFolderJob>>) -> Self {
        Self {
            kind: MaintenanceTaskKind::try_from(value).unwrap(),
            watchfolder,
            check,
        }
    }

    async fn check_sampler_values(self: &Self, ctx: &JobContext) -> Result<(), String> {
        let images: Vec<images::Model> = images::Entity::find()
            .join(JoinType::InnerJoin, images::Relation::Projects.def())
            .filter(projects::Column::WatchfolderId.eq(self.watchfolder.id))
            .filter(images::Column::WallClock.gt("2026-02-01"))
            .filter(images::Column::Sampler.eq(1))
            .into_model()
            .all(&ctx.pdb.db)
            .await
            .map_err(|e| e.to_string())?;

        let mut projects: HashMap<i64, Vec<images::Model>> = HashMap::new();
        for image in images {
            projects.entry(image.project_id).or_default().push(image);
        }

        let mut fix: Vec<images::ActiveModel> = Vec::new();

        for (project_id, images) in projects.drain() {
            let dt_project = ctx.pdb.get_dt_project(project_id.into()).await?;

            let samplers = &dt_project
                .get_samplers(&images.iter().map(|im| im.node_id).collect())
                .await
                .map_err(|e| e.to_string())?;

            for image in images {
                if let Some(sampler) = samplers.get(&image.node_id) {
                    let mut model = image.into_active_model();
                    model.sampler = Set(*sampler);
                    fix.push(model);
                }
            }
        }

        for model in fix {
            images::Entity::update(model)
                .exec(&ctx.pdb.db)
                .await
                .map_err(|e| e.to_string())?;
        }

        let model: watch_folders::Model = watch_folders::Entity::find_by_id(self.watchfolder.id)
            .into_model()
            .one(&ctx.pdb.db)
            .await
            .map_err(|e| e.to_string())?
            .unwrap();

        let mut model = model.into_active_model();
        model.maint = Set(self.watchfolder.maint ^ (self.kind as u32));
        watch_folders::Entity::update(model)
            .exec(&ctx.pdb.db)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

#[async_trait::async_trait]
impl Job for MaintenanceJob {
    fn get_label(&self) -> String {
        format!("MaintenanceJob for {}", self.watchfolder.path)
    }

    // optional
    // fn start_event(self: &Self) -> Option<DTPEvent> { None }

    // optional
    // async fn on_complete(&self, _ctx: &JobContext) {}

    // optional
    // async fn on_failed(&self, _ctx: &JobContext, _error: String) {}

    async fn execute(self: &Self, ctx: &JobContext) -> Result<JobResult, String> {
        for kind in TASK_KINDS {
            if (self.kind as u32) & (*kind as u32) != 0 {
                match kind {
                    MaintenanceTaskKind::RescanTCDTrailing => {
                        self.check_sampler_values(ctx).await?;
                    }
                }
            }
        }

        match &self.check {
            Some(job) => Ok(JobResult::Subtasks(vec![job.clone()])),
            None => Ok(JobResult::None),
        }
    }
}
