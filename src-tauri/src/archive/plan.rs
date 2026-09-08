use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::{
    dt_project::{split_tensor_name, TensorHistoryNode, ThnData},
    projects_db::DtProjectRef,
    IntoTAResult, TAResult,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CreateDtArchiveOptions {
    /// Project to archive.
    pub project_id: i64,
    /// Whether to use PNG instead of JPEG for archived images.
    pub lossless: bool,
    /// JPEG quality; this may also be used as the PNG effort.
    pub quality: f32,
    /// Directory where the archive will be saved.
    pub target: String,
}

#[derive(Debug, Serialize)]
pub struct DtArchivePlan {
    /// THE RESOURCES
    /// primary tensors
    pub primary_tensors: Vec<DtArchivePlanItem>,
    /// all other included tensors, should be DtRR::Tensor
    pub tensors_extra: Vec<DtArchivePlanItem>,

    // THE LEFT BEHIND
    /// tensors names that are not included in the archive
    pub unused_tensors: Vec<String>,
    /// tensordata rowids that will not be archived
    pub unused_tensordata: Vec<i64>,
    /// tensorhistorynodes that will not be archived
    pub unused_nodes: Vec<i64>,
    /// tensormoodboarddata that will not be archived
    pub unused_tensormoodboarddata: Vec<i64>,
}

/// Counts of tensors grouped by their Draw Things resource prefix.
#[derive(Clone, Debug, Default, Serialize)]
pub struct TensorCounts {
    pub tensor_history: u32,
    pub binary_mask: u32,
    pub shuffle: u32,
    pub custom: u32,
    pub depth_map: u32,
    pub color_palette: u32,
    pub audio: u32,
    pub scribble: u32,
}

impl TensorCounts {
    pub fn add(&mut self, tensor_name: &str) {
        if let Some((prefix, _)) = tensor_name.rsplit_once("_") {
            match prefix {
                "tensor_history" => self.tensor_history += 1,
                "binary_mask" => self.binary_mask += 1,
                "shuffle" => self.shuffle += 1,
                "custom" => self.custom += 1,
                "depth_map" => self.depth_map += 1,
                "color_palette" => self.color_palette += 1,
                "audio" => self.audio += 1,
                "scribble" => self.scribble += 1,
                _ => {}
            }
        }
    }
}

impl From<&DtArchivePlan> for TensorCounts {
    fn from(value: &DtArchivePlan) -> Self {
        let mut counts = Self::default();

        let items = value.primary_tensors.iter().chain(&value.tensors_extra);

        for item in items {
            if let Some((prefix, _)) = item.name.rsplit_once("_") {
                match prefix {
                    "tensor_history" => counts.tensor_history += 1,
                    "binary_mask" => counts.binary_mask += 1,
                    "shuffle" => counts.shuffle += 1,
                    "custom" => counts.custom += 1,
                    "depth_map" => counts.depth_map += 1,
                    "color_palette" => counts.color_palette += 1,
                    "audio" => counts.audio += 1,
                    "scribble" => counts.scribble += 1,
                    _ => {}
                }
            }
        }

        counts
    }
}

/// Information shown before creating an archive.
#[derive(Clone, Debug, Serialize, Default)]
pub struct DtArchivePreview {
    /// Amount of each tensor type
    pub tensors: TensorCounts,
    /// The number of primary tensors (DTM-indexed images that are gen=true)
    pub primary_tensors: u32,
    /// The number of extra tensors
    pub extra_tensors: u32,
    /// Number and total byte size of half-size thumbnails included in the archive.
    pub thumbhalf: (u64, u64),
    /// Current project file size in bytes.
    pub filesize: u64,
    /// Estimated archive size in bytes.
    pub estimate: u64,
    /// Whether Draw Things currently has the project open.
    pub file_in_use: bool,
}

#[derive(Debug, Serialize)]
pub struct DtArchivePlanItem {
    pub name: String,
    pub node_id: Option<i64>,
    pub preview_id: Option<i64>,
    pub index: i64,
}

pub async fn copy_everything_plan(project_id: i64) -> TAResult<DtArchivePlan> {
    let project = DtProjectRef::Id(project_id)
        .get_project()
        .await
        .with_context(|| format!("failed to open project {project_id} for archive planning"))
        .into_ta_result()?;

    let mut main_tensor_ids: HashSet<i64> = HashSet::new();
    let mut gen_images: Vec<DtArchivePlanItem> = Vec::new();
    let mut extra_resources: Vec<DtArchivePlanItem> = Vec::new();

    let mut batcher =
        project.batch_tensor_history_nodes(ThnData::tensordata().and_moodboard().and_clip());

    while let Some(nodes) = batcher
        .next()
        .await
        .with_context(|| {
            format!("failed to fetch tensor history node batch for project {project_id}")
        })
        .into_ta_result()?
    {
        for node in nodes {
            let node_id = node.rowid;
            let data = node.data();

            if data.generated() {
                let (tensor_id, _) = get_tensor_and_mask(&node);
                main_tensor_ids.insert(tensor_id);

                gen_images.push(DtArchivePlanItem {
                    name: format!("tensor_history_{}", tensor_id),
                    node_id: Some(node_id),
                    preview_id: Some(data.preview_id()),
                    index: node_id,
                });
            }
        }
    }

    let mut extra_tensor_index = 0;
    for (_, name) in project
        .list_tensors()
        .await
        .with_context(|| format!("failed to list tensors for project {project_id}"))
        .into_ta_result()?
    {
        let (_, tensor_id) = split_tensor_name(&name)?;
        if !main_tensor_ids.contains(&tensor_id) {
            extra_tensor_index += 1;
            extra_resources.push(DtArchivePlanItem {
                name,
                node_id: None,
                preview_id: None,
                index: extra_tensor_index,
            });
        }
    }

    Ok(DtArchivePlan {
        primary_tensors: gen_images,
        tensors_extra: extra_resources,
        unused_tensors: Vec::new(),
        unused_tensordata: Vec::new(),
        unused_nodes: Vec::new(),
        unused_tensormoodboarddata: Vec::new(),
    })
}

/// This should not be used, but one day may be fixed for a more efficient archive
pub async fn create_plan(project_id: i64) -> TAResult<DtArchivePlan> {
    let project = DtProjectRef::Id(project_id)
        .get_project()
        .await
        .into_ta_result()?;

    let unused_node_ids: Vec<i64> = Vec::new();

    // the ids for the 'primary' tensor - the generated image for a node
    let mut main_tensor_ids: HashSet<i64> = HashSet::new();
    // the ids for secondary tensors - control images, canvas, etc
    let mut tensor_ids: HashSet<i64> = HashSet::new();

    // tensordata rows for the tensors/nodes we are archiving
    let mut tensordata_ids: HashSet<i64> = HashSet::new();
    // tensormoodboarddata rows for the tensors/nodes we are archiving
    let mut tensormoodboarddata_ids: HashSet<i64> = HashSet::new();
    let mut gen_images: Vec<DtArchivePlanItem> = Vec::new();
    let mut extra_resources: Vec<DtArchivePlanItem> = Vec::new();
    let mut unused_tensor_names: Vec<String> = Vec::new();

    let mut batcher =
        project.batch_tensor_history_nodes(ThnData::tensordata().and_moodboard().and_clip());

    while let Some(nodes) = batcher.next().await? {
        for node in nodes {
            let node_id = node.rowid;
            let data = node.data();

            // take everything

            // if !data.generated() {
            //     unused_node_ids.push(node_id);
            //     continue;
            // }

            let (main_tensor_id, main_mask_id) = get_tensor_and_mask(&node);

            // add all associated tensordata
            if let Some(tensordata) = &node.tensordata {
                // add all related tensordata to the archive
                tensor_ids.extend(&node.data_tensor_ids());
                tensordata_ids.extend(tensordata.iter().map(|td| td.rowid));
            }

            // add the primary tensor
            if main_tensor_id != 0 {
                gen_images.push(DtArchivePlanItem {
                    name: format!("tensor_history_{}", main_tensor_id),
                    node_id: Some(node_id),
                    preview_id: if data.generated() {
                        Some(data.preview_id())
                    } else {
                        None
                    },
                    index: node_id,
                });
                main_tensor_ids.insert(main_tensor_id);
            } else {
                println!("couldn't find tensor id for node {}", node_id)
            }

            // put the mask in
            if main_mask_id != 0 {
                tensor_ids.insert(main_mask_id);
            }

            // add any moodboard items
            if let Some(moodboard) = &node.moodboard {
                tensormoodboarddata_ids.extend(moodboard.iter().map(|mb| mb.rowid));
                tensor_ids.extend(moodboard.iter().map(|mb| mb.shuffle_id));
            }

            // add audio
            if let Some(clip) = &node.clip {
                if data.index_in_a_clip() == 1 && clip.audio_id != 0 {
                    tensor_ids.insert(clip.audio_id);
                }
            }
        }
    }

    // we need to organize all tensors into three groups:
    // 1 "primary" - the outputs from a gen, using a DtRR::TensorHistoryNode
    // 2 "extra" - all other tensors that are associated with a gen, using DtRR::Tensor
    // 3 "unused" - all other tensors that are not associated with a gen, using tensor name
    // using these inputs:
    // 4 a list of all tensor names
    // 5 a list of all tensor ids that were discovered while compiling nodes
    // 6 a list of all "primary" tensors, as a DtRR::THN (so 1 is done)
    // 7 a list of all "primary" tensor ids
    // note that some are 'ids' and some are 'names'
    // so I think the most straightforward approach is iterate over all names, and
    // and match the numeric component to the correct group, so...
    // for each tensor name:
    // - if id is in
    // 2 extra is is 5 - 7 -> DtRR::Tensor
    // 3 unused is 4 - 5

    let all_tensor_names: Vec<String> = project
        .list_tensors()
        .await?
        .iter()
        .map(|(_, name)| name.clone())
        .collect();
    let tensor_count = all_tensor_names.len();

    let mut extra_index = 0;
    for tensor_name in all_tensor_names.into_iter() {
        let id = tensor_name
            .rsplit_once("_")
            .map(|(_, id_str)| id_str.parse::<i64>().unwrap_or(0))
            .unwrap_or(0);
        if id == 0 {
            println!("Problem with tensor name? {}", tensor_name);
            continue;
        }
        if main_tensor_ids.contains(&id) {
            continue;
        } else if tensor_ids.contains(&id) {
            extra_index += 1;
            extra_resources.push(DtArchivePlanItem {
                name: tensor_name,
                node_id: None,
                preview_id: None,
                index: extra_index,
            });
        } else {
            unused_tensor_names.push(tensor_name);
        }
    }

    let all_tensordata_ids = project.list_tensor_data_ids().await?;
    let (copy_tensordata_ids, unused_tensordata_ids): (Vec<_>, Vec<_>) = all_tensordata_ids
        .iter()
        .partition(|td| tensordata_ids.contains(td));

    let all_tensormoodboarddata_ids = project.list_tensor_moodboard_data_ids().await?;
    let (copy_tensormoodboarddata_ids, unused_tensormoodboarddata_ids): (Vec<_>, Vec<_>) =
        all_tensormoodboarddata_ids
            .iter()
            .partition(|tmbd| tensormoodboarddata_ids.contains(tmbd));

    println!(
        "Take {} tensors out of {}",
        main_tensor_ids.len(),
        tensor_count
    );
    println!(
        "Take {} tensordata out of {}",
        copy_tensordata_ids.len(),
        all_tensordata_ids.len()
    );
    println!(
        "Take {} tensormoodboarddata out of {}",
        copy_tensormoodboarddata_ids.len(),
        all_tensormoodboarddata_ids.len()
    );

    Ok(DtArchivePlan {
        primary_tensors: gen_images,
        tensors_extra: extra_resources,
        unused_tensors: unused_tensor_names,
        unused_tensordata: unused_tensordata_ids,
        unused_nodes: unused_node_ids,
        unused_tensormoodboarddata: unused_tensormoodboarddata_ids,
    })
}

fn get_tensor_and_mask(node: &TensorHistoryNode) -> (i64, i64) {
    let data = node.data();
    let mut main_tensor_id = data.tensor_id();
    let mut main_mask_id = data.mask_id();
    if let Some(tensordata) = &node.tensordata {
        if main_tensor_id == 0 {
            main_tensor_id = tensordata
                .iter()
                .rfind(|tdd| tdd.data().tensor_id() > 0)
                .map(|tdd| tdd.data().tensor_id())
                .unwrap_or(0);
        }
        if main_mask_id == 0 {
            main_mask_id = tensordata
                .iter()
                .rfind(|tdd| tdd.data().mask_id() > 0)
                .map(|tdd| tdd.data().mask_id())
                .unwrap_or(0);
        }
    }
    (main_tensor_id, main_mask_id)
}
