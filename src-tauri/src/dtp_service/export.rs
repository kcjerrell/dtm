use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use dtm_macros::dtp_commands;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Semaphore;

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        decode_tensor,
        dt_project::{ProjectRef, TensorHistoryNode, ThnData, ThnFilter},
        dtos::image::{ImageExtra, ListImagesOptions},
        extract_jpeg_slice, write_jpeg_with_metadata, DecodeTensorOptions,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExportOptions {
    pub output_folder: String,
    pub use_tensor: bool,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    current: usize,
    total: usize,
    msg: String,
}

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn export_projects(
        &self,
        project_ids: Vec<i64>,
        options: ProjectExportOptions,
    ) -> Result<(), String> {
        // rescan all referenced projects so the export reflects the latest state
        self.sync_projects_and_wait(project_ids.clone(), true).await?;

        let db = self.get_db().await?;

        // make sure the destination exists
        let output_folder = PathBuf::from(&options.output_folder);
        fs::create_dir_all(&output_folder).map_err(|e| e.to_string())?;

        // root temp directory for staging exported images before zipping
        let temp_root = self
            .app_handle
            .get_app_data_dir()
            .map_err(|e| e.to_string())?
            .join("temp_project_export");

        // total image count across all projects, used for the progress bar
        let grand_total = db
            .list_images(ListImagesOptions {
                project_ids: Some(project_ids.clone()),
                count: Some(true),
                show_disconnected: Some(true),
                ..Default::default()
            })
            .await?
            .total as usize;

        // shared, monotonically increasing count of finished images across all projects
        let exported = Arc::new(AtomicUsize::new(0));
        emit_progress(&self.app_handle, 0, grand_total, "Starting export…");

        for project_id in &project_ids {
            let project = db.get_project(*project_id).await?;

            // persistent reference, shared across the per-image tasks
            let dt_project = Arc::new(db.open_dt_project(ProjectRef::Id(*project_id)).await?);

            // fresh temp directory per project
            let temp_dir = temp_root.join(format!("project_{}", project_id));
            if temp_dir.exists() {
                fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
            }
            fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

            // images for this project, oldest first so the file ordering matches creation order
            let images = db
                .list_images(ListImagesOptions {
                    project_ids: Some(vec![*project_id]),
                    direction: Some("asc".to_string()),
                    show_disconnected: Some(true),
                    ..Default::default()
                })
                .await?
                .images
                .unwrap_or_default();

            // the counter is zero-padded to the width of the highest index
            let index_width = images.len().max(1).to_string().len();

            // export images concurrently: the work mixes db io and cpu-heavy tensor
            // decoding, so each task awaits the io then offloads the cpu work to a
            // blocking thread. the semaphore caps how many run at once.
            let semaphore = Arc::new(Semaphore::new(4));
            let mut handles = Vec::with_capacity(images.len());

            for (index, image) in images.into_iter().enumerate() {
                let permit = semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|e| e.to_string())?;

                let dt_project = dt_project.clone();
                let app_handle = self.app_handle.clone();
                let exported = exported.clone();
                let temp_dir = temp_dir.clone();
                let project_name = project.name.clone();
                let use_tensor = options.use_tensor;
                let filename_base = make_filename(index, index_width, &image);

                let handle = tokio::spawn(async move {
                    // hold the permit until this image is fully written
                    let _permit = permit;

                    // node carries the metadata and (for tensors) the output tensor name
                    let nodes = dt_project
                        .get_tensor_history_nodes(
                            Some(ThnFilter::Rowid(image.node_id)),
                            Some(ThnData::tensordata()),
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                    let node = match nodes.into_iter().next() {
                        Some(node) => node,
                        None => {
                            exported.fetch_add(1, Ordering::Relaxed);
                            return Ok::<(), String>(());
                        }
                    };
                    let node_data = node.node_data();

                    if use_tensor {
                        // full quality: decode the generated tensor to png, embedding metadata
                        let name = match resolve_tensor_name(&node) {
                            Some(name) => name,
                            None => {
                                exported.fetch_add(1, Ordering::Relaxed);
                                return Ok(());
                            }
                        };
                        let tensor = dt_project
                            .get_tensor_raw(&name)
                            .await
                            .map_err(|e| e.to_string())?;
                        let path = temp_dir.join(format!("{}.png", filename_base));
                        tokio::task::spawn_blocking(move || -> Result<(), String> {
                            let png = decode_tensor(
                                tensor,
                                DecodeTensorOptions {
                                    as_png: true,
                                    history_node: Some(node_data),
                                    scale: None,
                                },
                            )?;
                            fs::write(path, png).map_err(|e| e.to_string())
                        })
                        .await
                        .map_err(|e| e.to_string())??;
                    } else {
                        // faster: use the preview jpeg directly, writing metadata into the jpg
                        let thumb = dt_project
                            .get_thumb(image.preview_id)
                            .await
                            .map_err(|e| e.to_string())?;
                        let path = temp_dir.join(format!("{}.jpg", filename_base));
                        tokio::task::spawn_blocking(move || -> Result<(), String> {
                            let jpg = extract_jpeg_slice(&thumb)
                                .ok_or_else(|| "Failed to extract JPEG slice".to_string())?;
                            let jpg = write_jpeg_with_metadata(&jpg, &node_data)
                                .map_err(|e| e.to_string())?;
                            fs::write(path, jpg).map_err(|e| e.to_string())
                        })
                        .await
                        .map_err(|e| e.to_string())??;
                    }

                    let current = exported.fetch_add(1, Ordering::Relaxed) + 1;
                    emit_progress(
                        &app_handle,
                        current,
                        grand_total,
                        &format!("Exporting {}…", project_name),
                    );
                    Ok(())
                });
                handles.push(handle);
            }

            for handle in handles {
                handle.await.map_err(|e| e.to_string())??;
            }

            // zip the staged images into the output folder, then clean up
            let zip_path = output_folder.join(format!("{}.zip", sanitize(&project.name)));
            zip_dir(&temp_dir, &zip_path)?;
            let _ = fs::remove_dir_all(&temp_dir);
        }

        emit_progress(&self.app_handle, grand_total, grand_total, "Done");

        Ok(())
    }
}

fn emit_progress(app: &AppHandleWrapper, current: usize, total: usize, msg: &str) {
    if let Some(handle) = &app.app_handle {
        let _ = handle.emit(
            "export_projects_progress",
            ExportProgress {
                current,
                total,
                msg: msg.to_string(),
            },
        );
    }
}

/// Resolves the generated image's tensor name for a node, mirroring the
/// frontend's `tensorHistoryName` logic.
fn resolve_tensor_name(node: &TensorHistoryNode) -> Option<String> {
    let tensor_id = node.data().tensor_id();
    if tensor_id > 0 {
        return Some(format!("tensor_history_{}", tensor_id));
    }
    if let Some(tensordata) = &node.tensordata {
        for td in tensordata.iter().rev() {
            if let Some(name) = td
                .tensor_names
                .iter()
                .find(|n| n.starts_with("tensor_history_"))
            {
                return Some(name.clone());
            }
        }
    }
    None
}

/// Builds the extension-less base filename for an exported image. The leading
/// counter is zero-padded to `width` digits so all filenames in a project sort
/// in creation order.
fn make_filename(index: usize, width: usize, image: &ImageExtra) -> String {
    let prompt: String = sanitize(&image.prompt).chars().take(40).collect();
    let prompt = prompt.trim();
    if prompt.is_empty() {
        format!("{:0width$}", index + 1, width = width)
    } else {
        format!("{:0width$}_{}", index + 1, prompt, width = width)
    }
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_control()
                || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '/' | '\\')
            {
                '_'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn zip_dir(src: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut entries: Vec<PathBuf> = fs::read_dir(src)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .collect();
    entries.sort();

    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid file name".to_string())?;
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let data = fs::read(&path).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
