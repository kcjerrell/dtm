use crate::projects_db::{dt_project::TensorHistoryNode, DTProject};

impl DTProject {
    pub async fn get_nodes_from_tensor(
        &self,
        tensor_name: String,
    ) -> Result<Vec<TensorHistoryNode>, sqlx::Error> {
        todo!();
        // first we have to determine which table to join with from the tensor name
        // example tensor name: "tensor_history_8329398" or "depth_map_38209340"

        // tensory_history_node_### - tensordata__f20
        // binary_mask_### - tensordata__f22
        // depth_map_### - tensordata__f24
        // scribble_### - tensordata__f26
        // pose_### - tensordata__f28
        // color_palette_### - tensordata__f30
        // custom_### - tensordata__f32
        // join with tensordata on tensordata.rowid == tensordata__f##.rowid

        // shuffle_### - tensormoodboarddata__f10
        // join with tensormoodboarddata on tensormoodboarddata.rowid == tensormoodboarddata__f10.rowid

        // alias the tables the same way so the next join works regardless of tensordata vs
        // tensormoodboarddata (we'll rename both to td)

        // join tensorhistorynode thn on td.__pk0 == thn.__pk0 and thn.__pk1 == td.__pk1
    }
}
