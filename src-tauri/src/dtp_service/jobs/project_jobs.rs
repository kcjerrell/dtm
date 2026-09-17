use crate::{
    dtp_service::{
        events::{DTPEvent, ScanProgress},
        helpers::inspect_project_file,
        jobs::{sync_folder::ProjectSync, CheckFileJob, Job, JobContext, JobResult},
    },
    projects_db::{DtProjectRef, ProjectsDb},
};
use anyhow::{Context, Result};
use entity::images::Column;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QuerySelect};
use std::{path::Path, sync::Arc};

pub struct AddProjectJob {
    pub path: String,
    pub watchfolder_id: i64,
    pub is_import: bool,
}
impl AddProjectJob {
    pub fn new(sync: &ProjectSync, is_import: bool) -> Result<Self> {
        let file = sync.file.as_ref().context("project file not found")?;
        Ok(Self {
            path: file.path.clone(),
            watchfolder_id: sync.watchfolder_id,
            is_import,
        })
    }
}
#[async_trait::async_trait]
impl Job for AddProjectJob {
    fn get_label(&self) -> String {
        format!("Add project {}", self.path)
    }
    async fn folder_scope(&self, _ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(Some(self.watchfolder_id))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        let Some(folder) = ctx
            .pdb
            .get_watch_folder(self.watchfolder_id)
            .await
            .map_err(|e| e.to_string())?
        else {
            return Ok(JobResult::None);
        };
        if folder.is_missing || folder.is_locked {
            return Ok(JobResult::None);
        }
        let existing = ctx
            .pdb
            .get_project_by_path(folder.id, &self.path)
            .await
            .map_err(|e| e.to_string())?;
        let project = if let Some(project) = existing {
            project
        } else {
            let project = ctx
                .pdb
                .add_project(folder.id, &self.path)
                .await
                .map_err(|e| format!("{e:#}"))?;
            ctx.events.emit(DTPEvent::ProjectAdded(project.clone()));
            project
        };
        if self.is_import {
            ctx.events.emit(DTPEvent::ImportProgress(ScanProgress {
                projects_found: 1,
                projects_scanned: 0,
                images_found: 0,
                images_scanned: 0,
            }));
        }
        let job = UpdateProjectJob::from_id(&ctx.pdb, project.id, self.is_import, false)
            .await
            .map_err(|e| format!("{e:#}"))?;
        Ok(JobResult::Subtasks(vec![Arc::new(job)]))
    }
}

pub struct RemoveProjectJob {
    pub project_id: i64,
}
impl RemoveProjectJob {
    pub fn new(sync: &ProjectSync) -> Result<Self> {
        Ok(Self {
            project_id: sync.entity.as_ref().context("project entity not found")?.id,
        })
    }
}
#[async_trait::async_trait]
impl Job for RemoveProjectJob {
    fn get_label(&self) -> String {
        format!("Remove project {}", self.project_id)
    }
    async fn folder_scope(&self, ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(Some(
            ctx.pdb
                .get_project(self.project_id)
                .await
                .map_err(|e| e.to_string())?
                .watchfolder_id,
        ))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        let project = ctx
            .pdb
            .get_project(self.project_id)
            .await
            .map_err(|e| e.to_string())?;
        if project.is_locked || project.is_missing {
            return Ok(JobResult::None);
        }
        let folder = ctx
            .pdb
            .get_watch_folder(project.watchfolder_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("watch folder removed")?;
        // A missing/unreadable mount is not evidence that its projects were deleted.
        let metadata = std::fs::metadata(&folder.path)
            .map_err(|e| format!("cannot establish absence in {}: {e}", folder.path))?;
        if !metadata.is_dir() {
            return Err(format!("watch folder is not a directory: {}", folder.path));
        }
        if inspect_project_file(Path::new(&project.full_path), &folder.path, folder.id)
            .map_err(|e| format!("{e:#}"))?
            .is_some()
        {
            return Ok(JobResult::Subtasks(vec![Arc::new(CheckFileJob::new(
                project.full_path,
            ))]));
        }
        if let Some(id) = ctx
            .pdb
            .remove_project(self.project_id)
            .await
            .map_err(|e| e.to_string())?
        {
            ctx.events.emit(DTPEvent::ProjectRemoved(id));
        }
        Ok(JobResult::None)
    }
}

pub struct UpdateProjectJob {
    pub project_id: i64,
    pub watchfolder_id: i64,
    pub is_import: bool,
    pub check_deletions: bool,
    pub repair: bool,
}
impl UpdateProjectJob {
    pub fn new(sync: &ProjectSync, is_import: bool, check_deletions: bool) -> Result<Self> {
        let entity = sync.entity.as_ref().context("project entity not found")?;
        sync.file
            .as_ref()
            .with_context(|| format!("project file disappeared: {}", entity.full_path))?;
        Ok(Self {
            project_id: entity.id,
            watchfolder_id: entity.watchfolder_id,
            is_import,
            check_deletions,
            repair: false,
        })
    }
    pub async fn from_id(
        pdb: &ProjectsDb,
        id: i64,
        is_import: bool,
        check_deletions: bool,
    ) -> Result<Self> {
        Self::new(
            &ProjectSync::from_id(pdb, id).await?,
            is_import,
            check_deletions,
        )
    }
    async fn update(&self, ctx: &JobContext) -> Result<JobResult> {
        // Read current paths and metadata only after the folder lease is acquired.
        let sync = ProjectSync::from_id(&ctx.pdb, self.project_id).await?;
        let project = sync.entity.context("project not found")?;
        if project.excluded || project.is_locked || project.is_missing {
            return Ok(JobResult::None);
        }
        let before = sync
            .file
            .with_context(|| format!("project file disappeared: {}", project.full_path))?;
        if self.repair && !before.is_archive {
            ctx.pdb.repair_project(self.project_id).await?;
        } else {
            ctx.pdb.scan_project(self.project_id, false).await?;
            if self.check_deletions {
                check_deletions(ctx, self.project_id, &project.full_path).await?;
            }
        }
        let after = inspect_project_file(
            Path::new(&project.full_path),
            &sync.watchfolder_path,
            self.watchfolder_id,
        )?
        .with_context(|| format!("project disappeared during scan: {}", project.full_path))?;
        // Persist the pre-scan stamp: a concurrent write must remain detectable.
        let project = ctx
            .pdb
            .update_project(
                self.project_id,
                Some(before.filesize as i64),
                Some(before.modified),
            )
            .await?;
        if self.is_import {
            ctx.events.emit(DTPEvent::ImportProgress(ScanProgress {
                projects_found: 0,
                projects_scanned: 1,
                images_found: 0,
                images_scanned: project.image_count.unwrap_or(0) as u64,
            }));
        }
        ctx.events.emit(DTPEvent::ProjectUpdated(project.clone()));
        if !before.is_archive
            && (before.filesize != after.filesize || before.modified != after.modified)
        {
            return Ok(JobResult::Subtasks(vec![Arc::new(CheckFileJob::new(
                project.full_path,
            ))]));
        }
        Ok(JobResult::None)
    }
}
#[async_trait::async_trait]
impl Job for UpdateProjectJob {
    fn get_label(&self) -> String {
        format!("Update project {}", self.project_id)
    }
    async fn folder_scope(&self, _ctx: &JobContext) -> Result<Option<i64>, String> {
        Ok(Some(self.watchfolder_id))
    }
    fn start_event(&self) -> Option<DTPEvent> {
        Some(DTPEvent::ProjectSyncStarted(self.project_id))
    }
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, String> {
        self.update(ctx)
            .await
            .with_context(|| format!("failed to synchronize project {}", self.project_id))
            .map_err(|e| format!("{e:#}"))
    }
    async fn on_complete(&self, ctx: &JobContext) {
        ctx.events
            .emit(DTPEvent::ProjectSyncComplete(self.project_id));
    }
    async fn on_failed(&self, ctx: &JobContext, _error: String) {
        self.on_complete(ctx).await;
    }
}

async fn check_deletions(ctx: &JobContext, project_id: i64, project_path: &str) -> Result<()> {
    let dt_project = DtProjectRef::Path(project_path.to_owned())
        .open_project()
        .await?;
    // Query this service's database, not a hardcoded application database path.
    let ids: Vec<(i64, i64)> = entity::images::Entity::find()
        .select_only()
        .columns([Column::Id, Column::NodeId])
        .filter(Column::ProjectId.eq(project_id))
        .into_tuple()
        .all(&ctx.pdb.db)
        .await?;
    let current: Vec<i64> = sqlx::query_scalar("SELECT rowid FROM tensorhistorynode")
        .fetch_all(&*dt_project.pool)
        .await?;
    let current: std::collections::HashSet<i64> = current.into_iter().collect();
    let missing: Vec<i64> = ids
        .into_iter()
        .filter(|(_, node)| !current.contains(node))
        .map(|(id, _)| id)
        .collect();
    for chunk in missing.chunks(500) {
        entity::images::Entity::delete_many()
            .filter(Column::ProjectId.eq(project_id))
            .filter(Column::Id.is_in(chunk.to_vec()))
            .exec(&ctx.pdb.db)
            .await?;
    }
    if !missing.is_empty() {
        ctx.pdb.rebuild_images_fts_debounced();
    }
    Ok(())
}
