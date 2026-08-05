use std::collections::HashMap;

use entity::{images, projects, watch_folders};
use num_enum::TryFromPrimitive;
use sea_orm::{
    ActiveValue::Set, ColumnTrait, EntityTrait, ExprTrait, FromQueryResult, IntoActiveModel,
    JoinType, QueryFilter, QuerySelect, RelationTrait,
};
use sea_query::{Expr, Query};

use crate::{
    dtp_service::jobs::JobContext,
    dt_project::{ClipFilter, maintenance::Maintenance},
    projects_db::{
        dtos::watch_folder::WatchFolderDTO,
        DtProjectRef,
    },
};
use anyhow::{Context, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq, TryFromPrimitive)]
#[repr(u32)]
pub enum MaintenanceTaskKind {
    RescanTCDTrailing = 1,
    RescanClipCount = 2,
}

static TASK_KINDS: &[MaintenanceTaskKind] = &[
    MaintenanceTaskKind::RescanTCDTrailing,
    MaintenanceTaskKind::RescanClipCount,
];

/// Runs pending maintenance tasks for a watchfolder based on its `maint` bitmask.
/// Clears the completed bits from the watchfolder's `maint` field after each task.
pub async fn run_maintenance(
    maint: u32,
    watchfolder: &WatchFolderDTO,
    ctx: &JobContext,
) -> Result<()> {
    let mut remaining_maint = maint;

    for kind in TASK_KINDS {
        let bit = *kind as u32;
        if maint & bit != 0 {
            match kind {
                MaintenanceTaskKind::RescanTCDTrailing => {
                    log::info!(
                        "Maintenance: Rescanning TCD trailing for folder {}",
                        watchfolder.path
                    );
                    check_sampler_values(watchfolder, ctx).await?;
                }
                MaintenanceTaskKind::RescanClipCount => {
                    log::info!(
                        "Maintenance: Rescanning clip counts for folder {}",
                        watchfolder.path
                    );
                    check_clip_counts(watchfolder, ctx).await?;
                }
            }
            remaining_maint ^= bit;

            // update the maint field after each task completes
            let model: watch_folders::Model = watch_folders::Entity::find_by_id(watchfolder.id)
                .into_model()
                .one(&ctx.pdb.db)
                .await?
                .context("Watch folder not found")?;

            let mut model = model.into_active_model();
            model.maint = Set(remaining_maint);
            watch_folders::Entity::update(model)
                .exec(&ctx.pdb.db)
                .await?;
        }
    }

    Ok(())
}

#[derive(Debug, FromQueryResult)]
struct ClipCheck {
    project_id: i64,
    clip_id: i64,
}
async fn check_clip_counts(watchfolder: &WatchFolderDTO, ctx: &JobContext) -> Result<()> {
    let subquery = Query::select()
        .expr(Expr::val(1))
        .from(projects::Entity)
        .and_where(
            Expr::col(projects::Column::Id).equals((images::Entity, images::Column::ProjectId)),
        )
        .and_where(Expr::col(projects::Column::WatchfolderId).eq(watchfolder.id))
        .to_owned();

    let images = images::Entity::find()
        .filter(Expr::exists(subquery))
        .filter(images::Column::ClipId.gt(0))
        .select_only()
        .column(images::Column::ProjectId)
        .column(images::Column::ClipId)
        .into_model::<ClipCheck>()
        .all(&ctx.pdb.db)
        .await?;

    log::debug!(
        "Found {} videos with potentially incorrect num_frames",
        images.len()
    );

    let mut projects: HashMap<i64, Vec<ClipCheck>> = HashMap::new();
    for image in images {
        projects.entry(image.project_id).or_default().push(image);
    }

    for (project_id, images) in projects.drain() {
        // Here, ctx.pdb.get_dt_project returns Result<Arc<DTProject>, MixedError>
        // MixedError implements Into<anyhow::Error>, so ? works.
        let dt_project = ctx.pdb.get_dt_project(DtProjectRef::Id(project_id)).await?;

        log::debug!(
            "Checking {} videos for project {}",
            images.len(),
            project_id
        );

        let clip_ids = images.iter().map(|im| im.clip_id).collect();
        let clip_counts: HashMap<i64, i64> = dt_project
            .get_clips(ClipFilter::ClipIds(clip_ids))
            .await?
            .into_iter()
            .map(|c| (c.clip_id, c.count as i64))
            .collect();

        // update images.num_frames with correct counts
        for image in images {
            let num_frames = *clip_counts.get(&image.clip_id).unwrap_or(&0);
            images::Entity::update_many()
                .col_expr(images::Column::NumFrames, Expr::value(num_frames as i32))
                .filter(images::Column::ProjectId.eq(project_id))
                .filter(images::Column::ClipId.eq(image.clip_id))
                .exec(&ctx.pdb.db)
                .await?;
        }
    }

    Ok(())
}

async fn check_sampler_values(watchfolder: &WatchFolderDTO, ctx: &JobContext) -> Result<()> {
    let images: Vec<images::Model> = images::Entity::find()
        .join(JoinType::InnerJoin, images::Relation::Projects.def())
        .filter(projects::Column::WatchfolderId.eq(watchfolder.id))
        .filter(images::Column::WallClock.gt("2026-02-01"))
        .filter(images::Column::Sampler.eq(1))
        .into_model()
        .all(&ctx.pdb.db)
        .await?;

    let mut projects: HashMap<i64, Vec<images::Model>> = HashMap::new();
    for image in images {
        projects.entry(image.project_id).or_default().push(image);
    }

    let mut fix: Vec<images::ActiveModel> = Vec::new();

    for (project_id, images) in projects.drain() {
        let dt_project = ctx.pdb.get_dt_project(project_id.into()).await?;
        let node_ids: Vec<i64> = images.iter().map(|im| im.node_id).collect();
        let samplers = &dt_project.get_samplers(&node_ids).await?;

        for image in images {
            if let Some(sampler) = samplers.get(&image.node_id) {
                let mut model = image.into_active_model();
                model.sampler = Set(*sampler);
                fix.push(model);
            }
        }
    }

    for model in fix {
        images::Entity::update(model).exec(&ctx.pdb.db).await?;
    }

    Ok(())
}
