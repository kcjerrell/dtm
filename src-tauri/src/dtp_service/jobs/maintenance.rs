use std::collections::HashMap;

use entity::{images, projects, watch_folders};
use num_enum::TryFromPrimitive;
use sea_orm::{
    ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, JoinType, QueryFilter,
    QuerySelect, RelationTrait,
};

use crate::{
    dtp_service::jobs::JobContext,
    projects_db::{dtos::watch_folder::WatchFolderDTO, maintenance::Maintenance},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, TryFromPrimitive)]
#[repr(u32)]
pub enum MaintenanceTaskKind {
    RescanTCDTrailing = 1,
}

static TASK_KINDS: &[MaintenanceTaskKind] = &[MaintenanceTaskKind::RescanTCDTrailing];

/// Runs pending maintenance tasks for a watchfolder based on its `maint` bitmask.
/// Clears the completed bits from the watchfolder's `maint` field after each task.
pub async fn run_maintenance(
    maint: u32,
    watchfolder: &WatchFolderDTO,
    ctx: &JobContext,
) -> Result<(), String> {
    let mut remaining_maint = maint;

    for kind in TASK_KINDS {
        let bit = *kind as u32;
        if maint & bit != 0 {
            match kind {
                MaintenanceTaskKind::RescanTCDTrailing => {
                    check_sampler_values(watchfolder, ctx).await?;
                }
            }
            remaining_maint ^= bit;

            // update the maint field after each task completes
            let model: watch_folders::Model =
                watch_folders::Entity::find_by_id(watchfolder.id)
                    .into_model()
                    .one(&ctx.pdb.db)
                    .await
                    .map_err(|e| e.to_string())?
                    .unwrap();

            let mut model = model.into_active_model();
            model.maint = Set(remaining_maint);
            watch_folders::Entity::update(model)
                .exec(&ctx.pdb.db)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

async fn check_sampler_values(
    watchfolder: &WatchFolderDTO,
    ctx: &JobContext,
) -> Result<(), String> {
    let images: Vec<images::Model> = images::Entity::find()
        .join(JoinType::InnerJoin, images::Relation::Projects.def())
        .filter(projects::Column::WatchfolderId.eq(watchfolder.id))
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

    Ok(())
}
