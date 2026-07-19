use std::{collections::HashSet};

use tauri::State;

use crate::{
    dtp_service::{AppHandleWrapper, DTPService},
    projects_db::{
        archive::copy::{copy_project, ArchivePlan},
        dt_project::{ThnData},
         DtProjectRef, DtResourceRef, ThnRef, ThnResource,
    },
    IntoTAResult, TAResult,
};

mod copy;

#[tauri::command]
pub async fn create_dt_archive(
    app: State<'_, AppHandleWrapper>,
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<ArchivePlan> {
    let plan = compile_resources(dtp, project_id).await?;
    copy_project(
        app.inner().clone(),
        DtProjectRef::Id(project_id),
        plan.clone(),
    )
    .await?;
    Ok(plan)
}

/// Scans a DTProject and compiles lists of all resources that should be in the
/// archive.
#[tauri::command]
pub async fn compile_resources(
    dtp: State<'_, DTPService>,
    project_id: i64,
) -> TAResult<ArchivePlan> {
    let db = dtp.get_db().await.map_err(|e| anyhow::anyhow!(e))?;
    let project = db
        .get_dt_project(DtProjectRef::Id(project_id))
        .await
        .into_ta_result()?;

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

    // a list of resource refs associating a node to the generated image tensor
    // the ids for these are listed in main_tensor_ids
    let mut resources: Vec<DtResourceRef> = Vec::new();
    let mut extra_resources: Vec<DtResourceRef> = Vec::new();
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
                let resource_ref = DtResourceRef::TensorHistoryNode(
                    ThnRef::RowId(node_id),
                    ThnResource::Tensor(format!("tensor_history_{}", main_tensor_id)),
                );
                resources.push(resource_ref);
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
            extra_resources.push(DtResourceRef::Tensor(tensor_name));
        } else {
            unused_tensor_names.push(tensor_name);
        }
    }

    let all_tensordata_ids = project.list_tensor_data_ids().await?;
    let (copy_tensordata_ids, unused_tensordata_ids): (Vec<_>, Vec<_>) = all_tensordata_ids
        .iter()
        .partition(|td| tensordata_ids.contains(&td));

    let all_tensormoodboarddata_ids = project.list_tensor_moodboard_data_ids().await?;
    let (copy_tensormoodboarddata_ids, unused_tensormoodboarddata_ids): (Vec<_>, Vec<_>) =
        all_tensormoodboarddata_ids
            .iter()
            .partition(|tmbd| tensormoodboarddata_ids.contains(&tmbd));

    println!("Take {} nodes out of {}", node_ids.len(), total_nodes);
    println!("Take {} tensors out of {}", node_ids.len(), total_nodes);
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
        node_ids,
        tensordata_ids: copy_tensordata_ids,
        tensormoodboarddata_ids: copy_tensormoodboarddata_ids,
        primary_tensors: resources,
        tensors_extra: extra_resources,
        unused_tensors: unused_tensor_names,
        unused_tensordata: unused_tensordata_ids,
        unused_nodes: unused_node_ids,
        unused_tensormoodboarddata: unused_tensormoodboarddata_ids,
    })
}
