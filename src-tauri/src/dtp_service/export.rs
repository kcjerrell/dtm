use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use dtm_macros::dtp_commands;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Semaphore;

use crate::IntoTAResult;
use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        decode_tensor,
        dt_project::{TensorHistoryNode, ThnData, ThnFilter},
        dtos::image::{ImageExtra, ListImagesOptions},
        write_jpeg_with_metadata, DecodeTensorOptions, DtProjectRef, DtResourceHandle,
        DtResourceRef,
    },
    ResourceHandle,
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
    ) -> crate::TAResult<Vec<String>> {
        // rescan all referenced projects so the export reflects the latest state
        self.sync_projects_and_wait(project_ids.clone(), true)
            .await?;

        let db = self.get_db().await?;

        // make sure the destination exists
        let output_folder = PathBuf::from(&options.output_folder);
        fs::create_dir_all(&output_folder).into_ta_result()?;

        // root temp directory for staging exported images before zipping
        let temp_root = self
            .app_handle
            .get_app_data_dir()
            .map_err(anyhow::Error::msg)?
            .join("temp_project_export");

        // total image count across all projects, used for the progress bar
        let grand_total = db
            .list_images(ListImagesOptions {
                project_ids: Some(project_ids.clone()),
                count: Some(true),
                show_disconnected: Some(true),
                ..Default::default()
            })
            .await
            .into_ta_result()?
            .total as usize;

        // shared, monotonically increasing count of finished images across all projects
        let exported = Arc::new(AtomicUsize::new(0));
        emit_progress(&self.app_handle, 0, grand_total, "Starting export…");

        // paths of the archives created, returned so the caller can reveal them
        let mut zip_paths = Vec::with_capacity(project_ids.len());

        for project_id in &project_ids {
            let project = db.get_project(*project_id).await.into_ta_result()?;

            // persistent reference, shared across the per-image tasks
            let dt_project = db
                .open_dt_project(DtProjectRef::Id(*project_id))
                .await
                .into_ta_result()?;

            // fresh temp directory per project
            let temp_dir = temp_root.join(format!("project_{}", project_id));
            if temp_dir.exists() {
                fs::remove_dir_all(&temp_dir).into_ta_result()?;
            }
            fs::create_dir_all(&temp_dir).into_ta_result()?;

            // images for this project, oldest first so the file ordering matches creation order
            let images = db
                .list_images(ListImagesOptions {
                    project_ids: Some(vec![*project_id]),
                    direction: Some("asc".to_string()),
                    show_disconnected: Some(true),
                    ..Default::default()
                })
                .await
                .into_ta_result()?
                .images
                .unwrap_or_default();

            // the counter is zero-padded to the width of the highest index
            let index_width = images.len().max(1).to_string().len();

            // export images concurrently: the work mixes db io and cpu-heavy tensor
            // decoding, so each task awaits the io then offloads the cpu work to a
            // blocking thread. the semaphore caps how many run at once.
            let semaphore = Arc::new(Semaphore::new(4));
            let mut handles: Vec<tokio::task::JoinHandle<anyhow::Result<()>>> =
                Vec::with_capacity(images.len());

            for (index, image) in images.into_iter().enumerate() {
                let permit = semaphore.clone().acquire_owned().await.into_ta_result()?;

                let dt_project = dt_project.clone();
                let app_handle = self.app_handle.clone();
                let exported = exported.clone();
                let temp_dir = temp_dir.clone();
                let project_name = project.name.clone();
                let use_tensor = options.use_tensor;
                let filename_base = make_filename(index, index_width, &image);
                let project_id = *project_id;

                let handle = tokio::spawn(async move {
                    // hold the permit until this image is fully written
                    let _permit = permit;

                    // node carries the metadata and (for tensors) the output tensor name
                    let nodes = dt_project
                        .get_tensor_history_nodes(
                            Some(ThnFilter::Rowid(image.node_id)),
                            Some(ThnData::tensordata()),
                        )
                        .await?;
                    let node = match nodes.into_iter().next() {
                        Some(node) => node,
                        None => {
                            exported.fetch_add(1, Ordering::Relaxed);
                            return Ok(());
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
                        let tensor = dt_project.get_tensor_raw(&name).await?;
                        let path = temp_dir.join(format!("{}.png", filename_base));
                        tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
                            let png = decode_tensor(
                                tensor,
                                DecodeTensorOptions {
                                    as_png: true,
                                    history_node: Some(node_data),
                                    size: None,
                                },
                            )?;
                            fs::write(path, png).map_err(anyhow::Error::from)
                        })
                        .await??;
                    } else {
                        // faster: use the preview jpeg directly, writing metadata into the jpg
                        let handle = DtResourceHandle::new(
                            &DtProjectRef::Id(project_id),
                            &DtResourceRef::Thumb(image.preview_id),
                        );
                        let jpg = handle
                            .get_preview(false)
                            .await?
                            .ok_or_else(|| anyhow::anyhow!("Failed to get preview"))?;
                        let path = temp_dir.join(format!("{}.jpg", filename_base));
                        tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
                            let jpg = write_jpeg_with_metadata(&jpg, &node_data)?;
                            fs::write(path, jpg).map_err(anyhow::Error::from)
                        })
                        .await??;
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
                handle.await.into_ta_result()??;
            }

            // zip the staged images into the output folder, then clean up.
            // a numeric suffix is added if an archive of the same name exists
            // so an export never overwrites a previous one.
            let zip_path = unique_path(&output_folder, &sanitize(&project.name), "zip");
            zip_dir(&temp_dir, &zip_path)?;
            let _ = fs::remove_dir_all(&temp_dir);
            zip_paths.push(zip_path.to_string_lossy().into_owned());
        }

        emit_progress(&self.app_handle, grand_total, grand_total, "Done");

        Ok(zip_paths)
    }
}

/// Returns a path inside `dir` for `stem.ext` that does not already exist,
/// appending `_1`, `_2`, … to the stem until a free name is found.
fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{}.{}", stem, ext));
    let mut n = 1;
    while candidate.exists() {
        candidate = dir.join(format!("{}_{}.{}", stem, n, ext));
        n += 1;
    }
    candidate
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
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '/' | '\\') {
                '_'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn zip_dir(src: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = fs::File::create(dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut entries: Vec<PathBuf> = fs::read_dir(src)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .collect();
    entries.sort();

    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;
        zip.start_file(name, options)?;
        let data = fs::read(&path)?;
        zip.write_all(&data)?;
    }

    zip.finish()?;
    Ok(())
}
