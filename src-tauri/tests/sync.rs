mod common;

#[cfg(test)]
mod tests {

    use crate::common::*;

    static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[tokio::test]
    async fn sync_projects_no_watch() {
        let _guard = TEST_MUTEX.lock().await;
        let (dtps, event_helper, wfh, _) = test_fixture(false, false).await;

        // `connect` queues an initial sync. Let it finish before adding a folder,
        // otherwise both sync jobs can discover and scan the newly-added folder.
        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        event_helper.reset_counts();

        // add empty watch folder
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 0);
        event_helper.reset_counts();

        // copy projects and sync
        wfh.copy_all();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        assert!(event_helper.wait_for_count("project_added", 2).await);
        assert!(event_helper.wait_for_at_least("project_updated", 2).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        assert!(event_helper.wait_for_count("project_removed", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();
        let _ = dtps.sync().await;

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        assert!(event_helper.wait_for_at_least("project_updated", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }

    #[tokio::test]
    async fn sync_projects_with_watch() {
        let _guard = TEST_MUTEX.lock().await;
        let (dtps, event_helper, wfh, _) = test_fixture(true, false).await;

        // `connect` queues an initial sync. Let it finish before adding a folder,
        // otherwise both sync jobs can discover and scan the newly-added folder.
        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        event_helper.reset_counts();

        // add empty watch folder
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();

        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        assert!(event_helper.wait_for_count("folder_sync_complete", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 0);
        event_helper.reset_counts();

        // copy projects and sync
        wfh.copy_all();

        assert!(event_helper.wait_for_count("project_added", 2).await);
        assert!(event_helper.wait_for_at_least("project_updated", 2).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 2);
        event_helper.reset_counts();

        // remove one project
        wfh.projects[0].remove();

        assert!(event_helper.wait_for_count("project_removed", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        event_helper.reset_counts();

        // update one project
        let current_image_count = projects[0].image_count.unwrap();
        wfh.projects[1].copy_variant();

        assert!(event_helper.wait_for_at_least("project_updated", 1).await);
        let projects = dtps.list_projects(None).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].image_count.unwrap(), current_image_count + 1);
        event_helper.reset_counts();

        dtps.stop().await;
    }
}

mod regressions {
    use crate::common::*;
    use dtm_lib::dtp_service::jobs::{CheckFileJob, SyncJob, UpdateProjectJob};
    use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set};
    use std::path::Path;

    async fn indexed() -> (
        dtm_lib::dtp_service::DTPService,
        EventHelper,
        crate::common::projects::WatchFolderHelper,
        String,
    ) {
        let (dtp, events, folder, path) = test_fixture(false, false).await;
        assert!(events.wait_for_count("sync_complete", 1).await);
        folder.copy_all();
        dtp.add_watchfolder(folder.watchfolder_path.clone(), folder.bookmark.clone())
            .await
            .unwrap();
        assert!(events.wait_for_count("sync_complete", 2).await);
        events.reset_counts();
        (dtp, events, folder, path)
    }

    #[tokio::test]
    async fn wal_checks_and_full_sync_share_persisted_metadata() {
        let (dtp, events, _folder, _) = indexed().await;
        let db = dtp.get_db().await.unwrap();
        let scheduler = dtp.scheduler.read().await.clone().unwrap();
        let project = db.list_projects(None).await.unwrap().remove(0);
        let source = sqlx::SqlitePool::connect(&format!("sqlite:{}", project.full_path))
            .await
            .unwrap();
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&source)
            .await
            .unwrap();
        sqlx::query("PRAGMA wal_autocheckpoint=0")
            .execute(&source)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE synchronization_test (value INTEGER)")
            .execute(&source)
            .await
            .unwrap();
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path.clone()))
            .await
            .unwrap();
        let stamp = db.get_project(project.id).await.unwrap();
        let inspected = dtm_lib::dtp_service::jobs::ProjectSync::from_id(&db, project.id)
            .await
            .unwrap()
            .file
            .unwrap();
        assert_eq!(stamp.filesize, Some(inspected.filesize as i64));
        let payload = events.payloads("project_updated").pop().unwrap();
        assert_eq!(payload["filesize"].as_i64(), stamp.filesize);
        assert_eq!(payload["image_count"].as_i64(), stamp.image_count);
        events.reset_counts();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path.clone()))
            .await
            .unwrap();
        assert_eq!(events.count("project_updated"), 0);
        sqlx::query("INSERT INTO synchronization_test VALUES (1)")
            .execute(&source)
            .await
            .unwrap();
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path.clone()))
            .await
            .unwrap();
        assert_eq!(events.count("project_updated"), 1);
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&source)
            .await
            .unwrap();
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path.clone()))
            .await
            .unwrap();
        source.close().await;
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        let count = events.count("project_updated");
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path))
            .await
            .unwrap();
        assert_eq!(events.count("project_updated"), count);
        dtp.stop().await;
    }

    #[tokio::test]
    #[cfg(unix)]
    async fn partial_discovery_missing_folders_and_vanished_refresh_preserve_records() {
        let (dtp, events, folder, _) = indexed().await;
        let db = dtp.get_db().await.unwrap();
        let scheduler = dtp.scheduler.read().await.clone().unwrap();
        let loop_path = Path::new(&folder.watchfolder_path).join("loop.sqlite3");
        std::os::unix::fs::symlink(&loop_path, &loop_path).unwrap();
        assert!(scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .is_err());
        assert_eq!(db.list_projects(None).await.unwrap().len(), 2);
        assert_eq!(events.count("sync_complete"), 1);
        assert_eq!(
            events
                .payloads("sync_failed")
                .iter()
                .filter(|p| p.as_str().is_some_and(|s| s.starts_with("SyncJob:")))
                .count(),
            1
        );
        std::fs::remove_file(loop_path).unwrap();
        let moved = format!("{}-missing", folder.watchfolder_path);
        std::fs::rename(&folder.watchfolder_path, &moved).unwrap();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        assert_eq!(db.list_projects(None).await.unwrap().len(), 2);
        assert!(db.list_watch_folders().await.unwrap()[0].is_missing);
        std::fs::rename(moved, &folder.watchfolder_path).unwrap();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        let project = db.list_projects(None).await.unwrap().remove(0);
        std::fs::remove_file(&project.full_path).unwrap();
        assert!(dtp.sync_projects(vec![project.id], true).await.is_err());
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(project.full_path))
            .await
            .unwrap();
        assert_eq!(db.list_projects(None).await.unwrap().len(), 1);
        dtp.stop().await;
    }

    #[tokio::test]
    async fn scan_and_persistence_failures_balance_progress_and_retry() {
        let (dtp, events, _folder, _) = indexed().await;
        let db = dtp.get_db().await.unwrap();
        let scheduler = dtp.scheduler.read().await.clone().unwrap();
        let project = db.list_projects(None).await.unwrap().remove(0);
        db.db.execute_unprepared("CREATE TRIGGER fail_stamp BEFORE UPDATE OF modified ON projects BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END").await.unwrap();
        let job = UpdateProjectJob::from_id(&db, project.id, false, false)
            .await
            .unwrap();
        assert!(scheduler
            .add_job_front_and_wait(job)
            .await
            .unwrap_err()
            .contains("test persistence failure"));
        assert_eq!(events.count("project_sync_started"), 1);
        assert_eq!(events.count("project_sync_complete"), 1);
        assert_eq!(events.count("project_updated"), 0);
        assert_eq!(
            db.get_project(project.id).await.unwrap().modified,
            project.modified
        );
        db.db
            .execute_unprepared("DROP TRIGGER fail_stamp")
            .await
            .unwrap();
        let original = std::fs::read(&project.full_path).unwrap();
        std::fs::write(&project.full_path, b"not a database").unwrap();
        let job = UpdateProjectJob::from_id(&db, project.id, false, true)
            .await
            .unwrap();
        assert!(scheduler.add_job_front_and_wait(job).await.is_err());
        assert_eq!(events.count("project_sync_started"), 2);
        assert_eq!(events.count("project_sync_complete"), 2);
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            project.image_count
        );
        std::fs::write(&project.full_path, original).unwrap();
        scheduler
            .add_job_front_and_wait(
                UpdateProjectJob::from_id(&db, project.id, false, false)
                    .await
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(events.count("project_updated"), 1);
        let image = entity::images::Entity::find()
            .filter(entity::images::Column::ProjectId.eq(project.id))
            .one(&db.db)
            .await
            .unwrap()
            .unwrap();
        let mut phantom: entity::images::ActiveModel = image.into();
        phantom.id = sea_orm::ActiveValue::NotSet;
        phantom.node_id = Set(999999);
        phantom.insert(&db.db).await.unwrap();
        db.db.execute_unprepared("CREATE TRIGGER fail_deletion BEFORE DELETE ON images BEGIN SELECT RAISE(ABORT, 'test deletion failure'); END").await.unwrap();
        let started = events.count("project_sync_started");
        let job = UpdateProjectJob::from_id(&db, project.id, false, true)
            .await
            .unwrap();
        assert!(scheduler
            .add_job_front_and_wait(job)
            .await
            .unwrap_err()
            .contains("test deletion failure"));
        assert_eq!(events.count("project_sync_complete"), started + 1);
        db.db
            .execute_unprepared("DROP TRIGGER fail_deletion")
            .await
            .unwrap();
        let job = UpdateProjectJob::from_id(&db, project.id, false, true)
            .await
            .unwrap();
        scheduler.add_job_front_and_wait(job).await.unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            project.image_count
        );
        dtp.stop().await;
    }

    #[tokio::test]
    async fn repair_updates_retained_rows_and_rolls_back_on_read_failure() {
        let (dtp, _events, folder, _) = indexed().await;
        let db = dtp.get_db().await.unwrap();
        let project = db
            .list_projects(None)
            .await
            .unwrap()
            .into_iter()
            .find(|p| p.path.contains("c-9"))
            .unwrap();
        folder.projects[1].copy_variant();
        db.repair_project(project.id).await.unwrap();
        let expanded = db.get_project(project.id).await.unwrap();
        assert_eq!(
            expanded.image_count.unwrap(),
            project.image_count.unwrap() + 1
        );
        let image = entity::images::Entity::find()
            .filter(entity::images::Column::ProjectId.eq(project.id))
            .one(&db.db)
            .await
            .unwrap()
            .unwrap();
        let original_prompt = image.prompt.clone();
        let image_id = image.id;
        let mut changed: entity::images::ActiveModel = image.into();
        changed.prompt = Set("staleuniqueprompt".into());
        changed.prompt_search = Set("staleuniqueprompt".into());
        changed.update(&db.db).await.unwrap();
        let stale_model = entity::models::ActiveModel {
            filename: Set("dtm-258-stale-link".into()),
            model_type: Set(entity::enums::ModelType::Lora),
            ..Default::default()
        }
        .insert(&db.db)
        .await
        .unwrap();
        entity::image_loras::ActiveModel {
            image_id: Set(image_id),
            lora_id: Set(stale_model.id),
            weight: Set(1.0),
        }
        .insert(&db.db)
        .await
        .unwrap();
        db.rebuild_images_fts().await.unwrap();
        let search = || dtm_lib::projects_db::dtos::image::ListImagesOptions {
            search: Some("staleuniqueprompt".into()),
            ..Default::default()
        };
        assert_eq!(db.list_images(search()).await.unwrap().total, 1);
        folder.projects[1].copy();
        db.repair_project(project.id).await.unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            project.image_count
        );
        assert_eq!(
            entity::images::Entity::find_by_id(image_id)
                .one(&db.db)
                .await
                .unwrap()
                .unwrap()
                .prompt,
            original_prompt
        );
        let source = sqlx::SqlitePool::connect(&format!("sqlite:{}", project.full_path))
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO tensorhistorynode (rowid, __pk0, __pk1, p) VALUES (1001, -1, -1, x'00')",
        )
        .execute(&source)
        .await
        .unwrap();
        let changed = entity::images::ActiveModel {
            id: Set(image_id),
            prompt: Set("preserve on failed repair".into()),
            ..Default::default()
        };
        changed.update(&db.db).await.unwrap();
        assert!(db.repair_project(project.id).await.is_err());
        assert_eq!(
            entity::images::Entity::find_by_id(image_id)
                .one(&db.db)
                .await
                .unwrap()
                .unwrap()
                .prompt,
            "preserve on failed repair"
        );
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            project.image_count
        );
        sqlx::query("DELETE FROM tensorhistorynode")
            .execute(&source)
            .await
            .unwrap();
        source.close().await;
        db.repair_project(project.id).await.unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            Some(0)
        );
        dtp.stop().await;
    }

    #[tokio::test]
    async fn overlapping_adds_removal_locks_and_restart_converge() {
        let (dtp, events, folder, _) = test_fixture(false, false).await;
        assert!(events.wait_for_count("sync_complete", 1).await);
        folder.copy_all();
        dtp.add_watchfolder(folder.watchfolder_path.clone(), folder.bookmark.clone())
            .await
            .unwrap();
        let scheduler = dtp.scheduler.read().await.clone().unwrap();
        let (a, b) = tokio::join!(
            scheduler.add_job_front_and_wait(SyncJob::new(false)),
            scheduler.add_job_front_and_wait(CheckFileJob::new(folder.projects[0].get_dest_path()))
        );
        a.unwrap();
        b.unwrap();
        assert!(events.wait_for_count("sync_complete", 3).await);
        assert_eq!(events.count("project_added"), 2);
        let db = dtp.get_db().await.unwrap();
        let watch = db.list_watch_folders().await.unwrap().remove(0);
        dtp.lock_folder(watch.id).await.unwrap();
        folder.projects[1].copy_variant();
        events.reset_counts();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        assert_eq!(events.count("project_updated"), 0);
        scheduler
            .add_job_front_and_wait(SyncJob::new(true))
            .await
            .unwrap();
        assert!(events.count("project_updated") >= 1);
        dtp.remove_watch_folder(watch.id).await.unwrap();
        scheduler
            .add_job_front_and_wait(CheckFileJob::new(folder.projects[0].get_dest_path()))
            .await
            .unwrap();
        assert!(db.list_projects(None).await.unwrap().is_empty());
        dtp.stop().await;
        let (events, channel) = EventHelper::new();
        dtp.connect(channel, false, "sqlite::memory:".into())
            .await
            .unwrap();
        assert!(events.wait_for_count("sync_complete", 1).await);
        dtp.stop().await;
    }
    #[tokio::test]
    async fn relocation_recursion_and_reinclusion_use_current_folder_state() {
        let (dtp, _events, folder, _) = indexed().await;
        let db = dtp.get_db().await.unwrap();
        let scheduler = dtp.scheduler.read().await.clone().unwrap();
        let project = db.list_projects(None).await.unwrap().remove(0);
        assert_eq!(
            db.get_project_path(project.id).await.unwrap(),
            project.full_path
        );
        let relocated = format!("{}-relocated", folder.watchfolder_path);
        std::fs::rename(&folder.watchfolder_path, &relocated).unwrap();
        db.update_bookmark_path(
            project.watchfolder_id,
            &format!("TESTBOOKMARK::{relocated}"),
            &relocated,
        )
        .await
        .unwrap();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        assert_eq!(
            db.get_project_path(project.id).await.unwrap(),
            format!("{relocated}/{}", project.path)
        );
        let nested = Path::new(&relocated).join("nested");
        std::fs::create_dir(&nested).unwrap();
        std::fs::copy(
            folder.projects[0].get_src_path(),
            nested.join("nested.sqlite3"),
        )
        .unwrap();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        assert_eq!(db.list_projects(None).await.unwrap().len(), 2);
        dtp.update_watch_folder(project.watchfolder_id, true)
            .await
            .unwrap();
        scheduler
            .add_job_front_and_wait(SyncJob::new(false))
            .await
            .unwrap();
        assert_eq!(db.list_projects(None).await.unwrap().len(), 3);
        dtp.update_project_exclude(project.id, true).await.unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            Some(0)
        );
        dtp.update_project_exclude(project.id, false).await.unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            project.image_count
        );
        dtp.stop().await;
    }

    #[tokio::test]
    async fn watcher_keeps_changes_arriving_before_scan_completion() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        let (dtp, events, folder, _) = test_fixture(true, false).await;
        assert!(events.wait_for_count("sync_complete", 1).await);
        folder.copy_all();
        dtp.add_watchfolder(folder.watchfolder_path.clone(), folder.bookmark.clone())
            .await
            .unwrap();
        assert!(events.wait_for_count("sync_complete", 2).await);
        let db = dtp.get_db().await.unwrap();
        let project = db
            .list_projects(None)
            .await
            .unwrap()
            .into_iter()
            .find(|p| p.path.contains("c-9"))
            .unwrap();
        let target = project.image_count.unwrap() + 1;
        let changed = Arc::new(AtomicBool::new(false));
        let converged = Arc::new(tokio::sync::Notify::new());
        let channel = tauri::ipc::Channel::new({
            let changed = changed.clone();
            let converged = converged.clone();
            let source = folder.projects[1].get_variant_src_path();
            let destination = project.full_path.clone();
            move |event| {
                if let tauri::ipc::InvokeResponseBody::Json(json) = event {
                    let event: serde_json::Value = serde_json::from_str(&json).unwrap();
                    if event["type"] == "project_updated"
                        && event["data"]["id"].as_i64() == Some(project.id)
                    {
                        // This callback runs inside the job, before its terminal
                        // event and folder-lease release. The watcher must queue it.
                        if !changed.swap(true, Ordering::SeqCst) {
                            std::fs::copy(&source, &destination).unwrap();
                        }
                        if event["data"]["image_count"].as_i64() == Some(target) {
                            converged.notify_one();
                        }
                    }
                }
                Ok(())
            }
        });
        dtp.events.set_channel(channel);
        dtp.sync_projects(vec![project.id], true).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(15), converged.notified())
            .await
            .unwrap();
        assert_eq!(
            db.get_project(project.id).await.unwrap().image_count,
            Some(target)
        );
        dtp.stop().await;
    }
}
