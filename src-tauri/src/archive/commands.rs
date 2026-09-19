use anyhow::Result;
use dashmap::DashMap;
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, LazyLock},
};

use sqlx::QueryBuilder;

use crate::{
    archive::{
        plan::copy_everything_plan, CopyTensorItem, CreateDtArchiveOptions, DtArchivePlan,
        DtArchivePlanItem, DtArchivePreview, TensorCounts,
    },
    dt_project::DTProject,
    projects_db::DtProjectRef,
    tensor::TensorKind,
    util::BatchReducer,
    TAResult,
};

struct PlanCacheEntry {
    opts: CreateDtArchiveOptions,
    plan: Arc<DtArchivePlan>,
    preview: DtArchivePreview,
}

static PLAN_CACHE: LazyLock<DashMap<i64, PlanCacheEntry>> = LazyLock::new(DashMap::new);

type ThumbnailStatsReducer = Box<
    dyn for<'a> Fn(
            &'a [i64],
            (u64, u64),
        ) -> Pin<Box<dyn Future<Output = Result<(u64, u64)>> + Send + 'a>>
        + Send
        + Sync,
>;

type TensorStatsReducer = Box<
    dyn for<'a> Fn(
            &'a [String],
            TensorStats,
        ) -> Pin<Box<dyn Future<Output = Result<TensorStats>> + Send + 'a>>
        + Send
        + Sync,
>;

#[tauri::command]
pub async fn create_dt_archive_plan(opts: CreateDtArchiveOptions) -> TAResult<DtArchivePreview> {
    if let Some(entry) = PLAN_CACHE.get(&opts.project_id) {
        let cached_opts = entry.opts.clone();
        let plan = Arc::clone(&entry.plan);
        let cached_preview = entry.preview.clone();
        drop(entry);

        let preview = if should_regenerate_preview(&cached_opts, &opts) {
            generate_dt_archive_preview(plan.as_ref(), &opts).await?
        } else {
            cached_preview
        };

        PLAN_CACHE.insert(
            opts.project_id,
            PlanCacheEntry {
                opts,
                plan,
                preview: preview.clone(),
            },
        );

        return Ok(preview);
    }

    let plan = Arc::new(copy_everything_plan(opts.project_id).await?);
    let preview = generate_dt_archive_preview(plan.as_ref(), &opts).await?;

    PLAN_CACHE.insert(
        opts.project_id,
        PlanCacheEntry {
            opts,
            plan,
            preview: preview.clone(),
        },
    );

    Ok(preview)
}

fn should_regenerate_preview(
    cached_opts: &CreateDtArchiveOptions,
    opts: &CreateDtArchiveOptions,
) -> bool {
    let format_changed = cached_opts.format != opts.format;
    // The target directory does not affect either the plan or preview.
    let _target_changed = cached_opts.target != opts.target;

    format_changed
}

async fn generate_dt_archive_preview(
    plan: &DtArchivePlan,
    opts: &CreateDtArchiveOptions,
) -> TAResult<DtArchivePreview> {
    let project_ref = DtProjectRef::Id(opts.project_id);
    let dt_project = project_ref.open_project().await?;

    let mut thumb_stats = thumbs_stats_reducer(&dt_project);
    let mut tensor_stats = tensor_stats_reducer(&dt_project);

    let mut preview = DtArchivePreview::default();

    let sample_every = (plan.primary_tensors.len() / 8).max(1);
    let mut til_sample = sample_every;
    let mut sample_items = Vec::with_capacity(8);

    for item in &plan.primary_tensors {
        if let Some(preview_id) = item.preview_id {
            thumb_stats.add(preview_id).await?;
        }
        tensor_stats.add(item.name.clone()).await?;

        if item.clip_id.is_some() {
            preview.video_frames += 1;
            if item.index_in_a_clip == 0 {
                preview.gen_videos += 1;
            }
        } else {
            preview.gen_images += 1;
        }

        til_sample -= 1;
        if til_sample == 0 {
            til_sample = sample_every;
            sample_items.push(item);
        }
    }
    for item in &plan.tensors_extra {
        tensor_stats.add(item.name.clone()).await?;
    }

    preview.primary_tensors = plan.primary_tensors.len() as u32;
    preview.extra_tensors = plan.tensors_extra.len() as u32;
    preview.thumbhalf = thumb_stats.finish().await?;

    let tensor_stats = tensor_stats.finish().await?;
    preview.tensors = tensor_stats.counts;

    preview.filesize = dt_project.get_db_file_size().await?;

    let (sample_pixels, final_size) =
        convert_sample_tensors(sample_items, &dt_project, &opts).await?;
    let image_bytes = if sample_pixels == 0 {
        0
    } else {
        let sample_bpp = final_size as f64 / sample_pixels as f64;
        (tensor_stats.pixels as f64 * sample_bpp).round() as u64
    };

    preview.estimate = image_bytes + preview.thumbhalf.1 + tensor_stats.other;

    Ok(preview)
}

#[tauri::command]
pub fn clear_dt_archive_plan_cache() {
    PLAN_CACHE.clear();
}

/// Converts selected image plan items and returns their total pixel count and encoded byte size.
async fn convert_sample_tensors(
    items: Vec<&DtArchivePlanItem>,
    dt_project: &DTProject,
    opts: &CreateDtArchiveOptions,
) -> Result<(u64, u64)> {
    if items.is_empty() {
        return Ok((0, 0));
    }

    let names: Vec<String> = items.iter().map(|item| item.name.clone()).collect();
    let dims = dt_project.get_tensor_dims(&names).await?;
    let project_ref = DtProjectRef::Path(dt_project.path.clone());
    let mut pixels = 0_u64;
    let mut encoded_bytes = 0_u64;

    for plan_item in items {
        let dim = dims
            .iter()
            .find(|dim| dim.name == plan_item.name)
            .ok_or_else(|| {
                anyhow::anyhow!("tensor dimensions not found for '{}'", plan_item.name)
            })?;

        anyhow::ensure!(
            matches!(TensorKind::from_name(&dim.name), TensorKind::Image),
            "sample tensor '{}' is not an image",
            dim.name
        );

        let width = u64::try_from(dim.width)
            .map_err(|_| anyhow::anyhow!("negative width for tensor '{}'", dim.name))?;
        let height = u64::try_from(dim.height)
            .map_err(|_| anyhow::anyhow!("negative height for tensor '{}'", dim.name))?;
        let channels = u64::try_from(dim.channels)
            .map_err(|_| anyhow::anyhow!("negative channel count for tensor '{}'", dim.name))?;
        let item_pixels = width
            .checked_mul(height)
            .and_then(|pixels| pixels.checked_mul(channels))
            .ok_or_else(|| anyhow::anyhow!("pixel count overflows for tensor '{}'", dim.name))?;

        // Preserve the history node so JPEG metadata matches the actual archive item, but skip
        // preview loading because thumbnails are estimated separately.
        let mut item = CopyTensorItem::extra(DtArchivePlanItem {
            name: plan_item.name.clone(),
            node_id: plan_item.node_id,
            preview_id: plan_item.preview_id,
            index: plan_item.index,
            ..Default::default()
        });
        item.convert(project_ref.clone(), opts.format).await?;

        let data = item.data.ok_or_else(|| {
            anyhow::anyhow!("conversion produced no data for '{}'", plan_item.name)
        })?;
        pixels = pixels
            .checked_add(item_pixels)
            .ok_or_else(|| anyhow::anyhow!("sample pixel count overflows"))?;
        encoded_bytes = encoded_bytes
            .checked_add(data.len() as u64)
            .ok_or_else(|| anyhow::anyhow!("sample byte count overflows"))?;
    }

    Ok((pixels, encoded_bytes))
}

fn thumbs_stats_reducer(
    dt_project: &Arc<DTProject>,
) -> BatchReducer<i64, (u64, u64), ThumbnailStatsReducer> {
    let dt_project = dt_project.clone();
    let reducer: ThumbnailStatsReducer = Box::new(move |thumb_ids: &[i64], thumb_stats| {
        let dt_project_clone = dt_project.clone();
        Box::pin(async move {
            let mut query = QueryBuilder::new(
                "SELECT length(p) - 8 FROM thumbnailhistoryhalfnode WHERE __pk0 IN (",
            );
            let mut ids = query.separated(", ");
            for id in thumb_ids {
                ids.push_bind(id);
            }
            ids.push_unseparated(")");

            let result: Vec<u64> = query
                .build_query_scalar()
                .fetch_all(dt_project_clone.pool().await?)
                .await?;

            let (count, total_size) = thumb_stats;
            Ok((
                count + result.len() as u64,
                total_size + result.iter().sum::<u64>(),
            ))
        })
    });

    BatchReducer::new(reducer, (0, 0), 100)
}

#[derive(Default)]
struct TensorStats {
    pub counts: TensorCounts,
    pub pixels: u64,
    pub size: u64,
    pub other: u64,
}

fn tensor_stats_reducer(
    dt_project: &Arc<DTProject>,
) -> BatchReducer<String, TensorStats, TensorStatsReducer> {
    let dt_project = dt_project.clone();
    let reducer: TensorStatsReducer = Box::new(move |tensor_names: &[String], mut tensor_stats| {
        let dt_project_clone = dt_project.clone();
        Box::pin(async move {
            let dims = dt_project_clone.get_tensor_dims(tensor_names).await?;

            for dim in &dims {
                tensor_stats.counts.add(&dim.name);
                let kind = TensorKind::from_name(&dim.name);
                match kind {
                    TensorKind::Image => {
                        tensor_stats.pixels +=
                            dim.height as u64 * dim.width as u64 * dim.channels as u64;
                        tensor_stats.size += dim.data_len as u64;
                    }
                    TensorKind::Pose => {
                        tensor_stats.other += estimate_pose(dim.n);
                    }
                    TensorKind::Audio => {
                        tensor_stats.other += 44 + dim.height as u64 * 2 * 4;
                    }
                    TensorKind::Binary => {
                        tensor_stats.other += (dim.n * dim.height) as u64;
                    }
                    TensorKind::Unknown => {}
                }
            }

            Ok(tensor_stats)
        })
    });

    BatchReducer::new(reducer, TensorStats::default(), 100)
}

fn estimate_pose(people: i32) -> u64 {
    // the base size is 38-40 bytes (avg 39)
    // per person is 131-761 bytes (avg 446)
    let base = 39;
    let per_person = 446;
    (base + per_person * people) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::archive::{Format, PngEffort};

    fn options(project_id: i64, format: Format, target: &str) -> CreateDtArchiveOptions {
        CreateDtArchiveOptions {
            project_id,
            format,
            target: target.to_string(),
        }
    }

    fn empty_plan() -> Arc<DtArchivePlan> {
        Arc::new(DtArchivePlan {
            primary_tensors: Vec::new(),
            tensors_extra: Vec::new(),
            unused_tensors: Vec::new(),
            unused_tensordata: Vec::new(),
            unused_nodes: Vec::new(),
            unused_tensormoodboarddata: Vec::new(),
        })
    }

    #[test]
    fn only_format_changes_regenerate_the_preview() {
        let cached = options(1, Format::Jpg(80), "/first");

        assert!(!should_regenerate_preview(&cached, &cached));
        assert!(should_regenerate_preview(
            &cached,
            &options(1, Format::Png(PngEffort::Balanced), "/first")
        ));
        assert!(should_regenerate_preview(
            &cached,
            &options(1, Format::Jpg(90), "/first")
        ));
        assert!(!should_regenerate_preview(
            &cached,
            &options(1, Format::Jpg(80), "/second")
        ));
    }

    #[test]
    fn cache_holds_multiple_projects_and_clear_removes_them() {
        PLAN_CACHE.clear();

        for project_id in [1, 2] {
            PLAN_CACHE.insert(
                project_id,
                PlanCacheEntry {
                    opts: options(project_id, Format::Jpg(80), "/target"),
                    plan: empty_plan(),
                    preview: DtArchivePreview::default(),
                },
            );
        }

        assert_eq!(PLAN_CACHE.len(), 2);

        clear_dt_archive_plan_cache();

        assert!(PLAN_CACHE.is_empty());
    }
}
