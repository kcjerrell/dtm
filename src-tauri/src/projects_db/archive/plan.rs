use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;

use crate::{
    dtp_service::DTPService,
    projects_db::{dt_project::ThnData, DtProjectRef},
    IntoTAResult, TAResult,
};

#[derive(Debug, Serialize)]
pub struct ArchivePlan {
    /// Project path
    pub project_path: PathBuf,

    /// Whether to use lossless compression
    pub lossless: bool,

    // THE DATA
    /// tensorhistorynode rowids
    pub node_ids: Vec<i64>,
    /// tensordata rowids
    pub tensordata_ids: Vec<i64>,
    /// tensormoodboarddata rowids
    pub tensormoodboarddata_ids: Vec<i64>,
    // clip rowids
    pub clip_ids: Vec<i64>,

    /// THE RESOURCES
    /// primary tensors, should be DtRR::Thn to link metadata
    pub primary_tensors: Vec<ArchivePlanItem>,
    /// all other included tensors, should be DtRR::Tensor
    pub tensors_extra: Vec<ArchivePlanItem>,

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

#[derive(Debug, Serialize)]
pub struct ArchivePlanItem {
    pub name: String,
    pub node_id: Option<i64>,
    pub preview_id: Option<i64>,
    pub index: i64,
}

/// Scans a DTProject and compiles lists of all resources that should be in the
/// archive.
pub async fn create_plan(
    dtp: &DTPService,
    project_id: i64,
    lossless: bool,
) -> TAResult<ArchivePlan> {
    let db = dtp.get_db().await.map_err(|e| anyhow::anyhow!(e))?;
    let project = db
        .get_dt_project(DtProjectRef::Id(project_id))
        .await
        .into_ta_result()?;

    let project_path = PathBuf::from(&project.path);

    let mut node_ids: Vec<i64> = Vec::new();
    let mut unused_node_ids: Vec<i64> = Vec::new();

    // the ids for the 'primary' tensor - the generated image for a node
    let mut main_tensor_ids: HashSet<i64> = HashSet::new();
    // the ids for secondary tensors - control images, canvas, etc
    let mut tensor_ids: HashSet<i64> = HashSet::new();

    // tensordata rows for the tensors/nodes we are archiving
    let mut tensordata_ids: HashSet<i64> = HashSet::new();
    // tensormoodboarddata rows for the tensors/nodes we are archiving
    let mut tensormoodboarddata_ids: HashSet<i64> = HashSet::new();
    // clip ids
    let mut clip_ids: HashSet<i64> = HashSet::new();

    // a list of resource refs associating a node to the generated image tensor
    // the ids for these are listed in main_tensor_ids
    let mut resources: Vec<ArchivePlanItem> = Vec::new();
    let mut extra_resources: Vec<ArchivePlanItem> = Vec::new();
    let mut unused_tensor_names: Vec<String> = Vec::new();

    let mut total_nodes = 0;

    let mut batcher = project.batch_tensor_history_nodes(ThnData::tensordata().and_moodboard());

    while let Some(nodes) = batcher.next().await? {
        for node in nodes {
            total_nodes += 1;
            let node_id = node.rowid;
            let data = node.data();
            if !data.generated() {
                unused_node_ids.push(node_id);
                continue;
            }
            // add node id
            node_ids.push(node_id);

            let mut main_tensor_id = data.tensor_id();

            // add associated tensordata
            if let Some(tensordata) = &node.tensordata {
                // add all related tensordata to the archive
                tensor_ids.extend(&node.data_tensor_ids());
                tensordata_ids.extend(tensordata.iter().map(|td| td.rowid));

                // find the generated image tensor name if it wasn't on the node
                if main_tensor_id == 0 {
                    if let Some(last) = tensordata.last() {
                        main_tensor_id = last.data().tensor_id();
                    }
                }
            }

            // add the primary tensor as a resource ref
            if main_tensor_id != 0 {
                resources.push(ArchivePlanItem {
                    name: format!("tensor_history_{}", main_tensor_id),
                    node_id: Some(node_id),
                    preview_id: Some(data.preview_id()),
                    index: node_id,
                });
                if data.clip_id() != 0 {
                    clip_ids.insert(data.clip_id());
                }
                main_tensor_ids.insert(main_tensor_id);
            } else {
                println!("couldn't find tensor id for node {}", node_id)
            }

            // add any moodboard items
            if let Some(moodboard) = node.moodboard {
                tensormoodboarddata_ids.extend(moodboard.iter().map(|mb| mb.rowid));
                tensor_ids.extend(moodboard.iter().map(|mb| mb.shuffle_id));
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
            extra_resources.push(ArchivePlanItem {
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

    println!("Take {} nodes out of {}", node_ids.len(), total_nodes);
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

    Ok(ArchivePlan {
        project_path,
        lossless,
        node_ids,
        tensordata_ids: copy_tensordata_ids,
        tensormoodboarddata_ids: copy_tensormoodboarddata_ids,
        clip_ids: clip_ids.into_iter().collect(),
        primary_tensors: resources,
        tensors_extra: extra_resources,
        unused_tensors: unused_tensor_names,
        unused_tensordata: unused_tensordata_ids,
        unused_nodes: unused_node_ids,
        unused_tensormoodboarddata: unused_tensormoodboarddata_ids,
    })
}
