//! Application-owned script input selection and Draw Things resource lookup.
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{bail, Context, Result};
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::{
    dtp_service::DTPService,
    projects_db::{DtProjectRef, ProjectsDb},
    ResourceHandle,
};

use super::{
    input::{selection_token, InputApprovals, InputResources},
    types::SelectedInput,
};

const SELECTION_LIFETIME: Duration = Duration::from_secs(8 * 60 * 60);
const MAX_RESOURCE_APPROVALS: usize = 256;

#[derive(Clone, PartialEq, Eq)]
struct IndexedImage {
    project_path: String,
    node_id: i64,
    preview_id: i64,
}

impl IndexedImage {
    async fn lookup(projects: &ProjectsDb, image_id: i64) -> Result<Self> {
        let image = projects
            .get_image(image_id)
            .await
            .with_context(|| format!("failed to find Draw Things image {image_id}"))?;
        if image.is_ready != Some(true) {
            bail!("the selected Draw Things project is unavailable");
        }
        let project = projects
            .get_project(image.project_id)
            .await
            .with_context(|| {
                format!("failed to find the project for Draw Things image {image_id}")
            })?;
        Ok(Self {
            project_path: project.full_path,
            node_id: image.node_id,
            preview_id: image.preview_id,
        })
    }
}

#[derive(Clone)]
struct ResourceApproval {
    image_id: i64,
    image: IndexedImage,
    expires: Instant,
}

impl ResourceApproval {
    async fn resolve(self, projects: &ProjectsDb) -> Result<Arc<dyn ResourceHandle>> {
        let image = IndexedImage::lookup(projects, self.image_id).await?;
        // A re-index can reuse row IDs. Verify the selection still identifies the
        // original project and node, and bind the handle to that backend path.
        if image != self.image {
            bail!("the selected Draw Things image changed; select it again");
        }
        Ok(Arc::new(
            DtProjectRef::Path(image.project_path).node(image.node_id),
        ))
    }
}

pub(crate) struct DrawThingsInputs {
    projects: DTPService,
    entries: Mutex<HashMap<String, ResourceApproval>>,
}

impl DrawThingsInputs {
    pub(super) fn new(projects: DTPService) -> Self {
        Self {
            projects,
            entries: Mutex::default(),
        }
    }

    async fn connected_projects(&self) -> Result<ProjectsDb> {
        self.projects
            .get_db()
            .await
            .context("Projects is not connected")
    }

    async fn select(&self, input_id: String, image_id: i64) -> Result<SelectedInput> {
        validate_input_id(&input_id)?;
        if image_id <= 0 {
            bail!("invalid Draw Things image ID");
        }
        let projects = self.connected_projects().await?;
        let image = IndexedImage::lookup(&projects, image_id).await?;
        self.approve(input_id, image_id, image)
    }

    fn approve(
        &self,
        input_id: String,
        image_id: i64,
        image: IndexedImage,
    ) -> Result<SelectedInput> {
        let token = selection_token()?;
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| anyhow::anyhow!("Draw Things input approvals poisoned"))?;
        entries.retain(|_, entry| entry.expires > Instant::now());
        if entries.len() >= MAX_RESOURCE_APPROVALS {
            bail!("too many active Draw Things input selections");
        }
        entries.insert(
            token.clone(),
            ResourceApproval {
                image_id,
                image,
                expires: Instant::now() + SELECTION_LIFETIME,
            },
        );
        Ok(SelectedInput::DrawThings {
            input_id,
            display_name: format!("Draw Things image {image_id}"),
            resource_id: token,
        })
    }

    fn approval(&self, token: &str) -> Result<ResourceApproval> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| anyhow::anyhow!("Draw Things input approvals poisoned"))?;
        entries.retain(|_, entry| entry.expires > Instant::now());
        entries
            .get(token)
            .cloned()
            .context("unapproved or expired Draw Things input selection")
    }

    fn revoke(&self, token: &str) -> Result<()> {
        self.entries
            .lock()
            .map_err(|_| anyhow::anyhow!("Draw Things input approvals poisoned"))?
            .remove(token);
        Ok(())
    }
}

#[async_trait::async_trait]
impl InputResources for DrawThingsInputs {
    async fn resolve(&self, resource_id: &str) -> Result<Arc<dyn ResourceHandle>> {
        let approval = self.approval(resource_id)?;
        let projects = self.connected_projects().await?;
        approval.resolve(&projects).await
    }
}

fn validate_input_id(input_id: &str) -> Result<()> {
    if input_id.is_empty() || input_id.len() > 1024 {
        bail!("invalid script input ID");
    }
    Ok(())
}

fn approve_picked_file(
    approvals: &InputApprovals,
    input_id: String,
    path: &Path,
) -> Result<SelectedInput> {
    let display_name = path
        .file_name()
        .context("selected image has no filename")?
        .to_string_lossy()
        .into_owned();
    let selection_token = approvals.approve_local(path, SELECTION_LIFETIME)?;
    Ok(SelectedInput::LocalFile {
        input_id,
        display_name,
        selection_token,
    })
}

/// Only the native dialog can supply a filesystem path for local approval.
#[tauri::command]
pub async fn pick_script_input(
    window: WebviewWindow,
    approvals: State<'_, Arc<InputApprovals>>,
    input_id: String,
) -> Result<Option<SelectedInput>, String> {
    validate_input_id(&input_id).map_err(super::commands::command_error)?;
    let (send, receive) = tokio::sync::oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Select an image for this script")
        .add_filter("Images", &["png", "jpg", "jpeg"])
        .pick_file(move |file| {
            let _ = send.send(file);
        });
    let Some(file) = receive
        .await
        .context("image picker did not return a result")
        .map_err(super::commands::command_error)?
    else {
        return Ok(None);
    };
    let approvals = approvals.inner().clone();
    tokio::task::spawn_blocking(move || {
        let path = file
            .into_path()
            .context("selected image is not a local file")?;
        approve_picked_file(&approvals, input_id, &path).map(Some)
    })
    .await
    .context("image approval worker failed")
    .and_then(|result| result)
    .map_err(super::commands::command_error)
}

#[tauri::command]
pub fn revoke_script_input(
    approvals: State<'_, Arc<InputApprovals>>,
    resources: State<'_, Arc<DrawThingsInputs>>,
    selection_token: String,
) -> Result<(), String> {
    approvals
        .revoke(&selection_token)
        .and_then(|()| resources.revoke(&selection_token))
        .map_err(super::commands::command_error)
}

/// Receives an indexed Projects image ID, never a project or resource path.
#[tauri::command]
pub async fn select_script_draw_things_input(
    resources: State<'_, Arc<DrawThingsInputs>>,
    input_id: String,
    image_id: i64,
) -> Result<SelectedInput, String> {
    resources
        .select(input_id, image_id)
        .await
        .map_err(super::commands::command_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dtp_service::AppHandleWrapper;

    fn disconnected_resources() -> DrawThingsInputs {
        DrawThingsInputs::new(DTPService::new(AppHandleWrapper::new(None)))
    }

    #[test]
    fn approval_payload_contains_only_the_picked_filename_and_opaque_token() {
        let folder = tempfile::tempdir().unwrap();
        let image = folder.path().join("my image.png");
        std::fs::write(&image, b"image staging performs content validation").unwrap();
        let approvals = InputApprovals::default();

        let selection = approve_picked_file(&approvals, "image".into(), &image).unwrap();
        let SelectedInput::LocalFile {
            selection_token, ..
        } = &selection
        else {
            panic!("expected local selection");
        };
        assert_eq!(selection_token.len(), 64);
        assert!(selection_token.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_eq!(
            serde_json::to_value(&selection).unwrap(),
            serde_json::json!({
                "type": "localFile",
                "inputId": "image",
                "displayName": "my image.png",
                "selectionToken": selection_token,
            })
        );
        approvals.revoke(selection_token).unwrap();
    }

    #[tokio::test]
    async fn draw_things_selection_rejects_ids_it_did_not_issue() {
        let resources = disconnected_resources();
        for id in ["../image.png", "1", "01", "-1", "0"] {
            let result = resources.resolve(id).await;
            assert!(matches!(result, Err(error) if error.to_string().contains("unapproved")));
        }
    }
    #[tokio::test]
    async fn indexed_selection_resolves_image_bytes_and_rejects_changed_or_revoked_rows() {
        use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

        let resources = disconnected_resources();
        assert!(resources
            .select("image".into(), 1)
            .await
            .unwrap_err()
            .to_string()
            .contains("not connected"));
        let dir = tempfile::tempdir().unwrap();
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("test_data/projects/test-project-a2.sqlite3");
        let name = "fixture.sqlite3";
        std::fs::copy(fixture, dir.path().join(name))
            .expect("run src-tauri/test-setup.sh to prepare project fixtures");
        let projects = ProjectsDb::new("sqlite::memory:").await.unwrap();
        let folder_path = dir.path().to_str().unwrap();
        let folder = projects
            .add_watch_folder(folder_path, "test", false)
            .await
            .unwrap();
        projects
            .update_watch_folder(folder.id, None, Some(false), Some(false))
            .await
            .unwrap();
        let project = projects.add_project(folder.id, name).await.unwrap();
        projects.scan_project(project.id, true).await.unwrap();
        projects.finish_maintenance().await;
        let row = entity::images::Entity::find()
            .filter(entity::images::Column::ProjectId.eq(project.id))
            .filter(entity::images::Column::NodeId.eq(2))
            .one(&projects.db)
            .await
            .unwrap()
            .unwrap();

        let indexed = IndexedImage::lookup(&projects, row.id).await.unwrap();
        let selected = resources.approve("image".into(), row.id, indexed).unwrap();
        let SelectedInput::DrawThings { resource_id, .. } = selected else {
            panic!("expected Draw Things selection");
        };
        assert_eq!(resource_id.len(), 64);
        let image = resources
            .approval(&resource_id)
            .unwrap()
            .resolve(&projects)
            .await
            .unwrap()
            .get_image(None)
            .await
            .unwrap()
            .unwrap();
        assert!(image.starts_with(b"\x89PNG\r\n\x1a\n"));

        let mut changed: entity::images::ActiveModel = row.into();
        changed.preview_id = Set(-1);
        changed.update(&projects.db).await.unwrap();
        let approval = resources.approval(&resource_id).unwrap();
        assert!(
            matches!(approval.resolve(&projects).await, Err(error) if error.to_string().contains("select it again"))
        );
        resources.revoke(&resource_id).unwrap();
        assert!(
            matches!(resources.resolve(&resource_id).await, Err(error) if error.to_string().contains("unapproved"))
        );
    }
}
