mod common;

#[cfg(test)]
mod tests {
    use crate::common::util::assert_vec_eq;

    use dtm_lib::{
        projects_db::{
            DTProject, DtProjectRef, DtResourceHandle, DtResourceRef, ThnRef, ThnResource,
        },
        ResourceHandle, TensorValue,
    };

    fn project_ref() -> DtProjectRef {
        DtProjectRef::from("test_data/projects/test-project-a2.sqlite3")
    }

    #[tokio::test]
    async fn test_preview_from_thumb() {
        let project_ref = DtProjectRef::from("test_data/projects/test-project-a2.sqlite3");
        let resource_handle = DtResourceHandle::new(&project_ref, &DtResourceRef::Thumb(209719244));

        let thumb = resource_handle.get_preview(false).await.unwrap().unwrap();
        assert!(thumb.len() > 0);
        assert_eq!(&thumb[0..3], &[0xFF, 0xD8, 0xFF]);
    }

    /*
     * DtResourceRef::TensorHistoryNode tests
     */
    #[tokio::test]
    async fn test_preview_from_node() {
        let project_ref = DtProjectRef::from("test_data/projects/test-project-a2.sqlite3");
        let resource_handle = DtResourceHandle::new(
            &project_ref,
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), ThnResource::Thumb),
        );

        let thumb = resource_handle.get_preview(false).await.unwrap().unwrap();
        assert!(thumb.len() > 0);
        assert_eq!(&thumb[0..3], &[0xFF, 0xD8, 0xFF]);
    }

    #[tokio::test]
    async fn test_canvas_tensor_from_node() {
        let rh = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), ThnResource::Canvas(0)),
        );
        let tensor = rh.get_tensor().await.unwrap().unwrap();
        let data_len = match &tensor.data {
            dtm_lib::TensorValue::F32(vec) => vec.len(),
            dtm_lib::TensorValue::U8(vec) => vec.len(),
        };
        assert!(data_len > 0);
        assert!(data_len == (tensor.width * tensor.height * tensor.channels * tensor.n) as usize);
    }

    #[tokio::test]
    async fn test_previews() {
        let dtp = DtProjectRef::from("test_data/projects/test-project-a2.sqlite3")
            .open_project()
            .await
            .unwrap();
        let nodes = dtp.get_tensor_history_nodes(None, None).await.unwrap();

        let mut previews = Vec::new();
        for node in nodes {
            let resource_handle = DtResourceHandle::new(
                &DtProjectRef::from("test_data/projects/test-project-a2.sqlite3"),
                &DtResourceRef::Thumb(node.data().preview_id()),
            );
            let preview = resource_handle.get_preview(true).await.unwrap();
            previews.push(preview);
        }
    }

    /*
     * DtResourceRef::Thumb tests
     */
    #[tokio::test]
    async fn test_tensor_from_thumb() {
        let resource_handle = DtResourceHandle::new(&project_ref(), &DtResourceRef::Thumb(209719244));

        let tensor = resource_handle.get_tensor().await.unwrap();
        assert!(tensor.is_none());
    }

    #[tokio::test]
    async fn test_preview_from_invalid_thumb() {
        let resource_handle = DtResourceHandle::new(&project_ref(), &DtResourceRef::Thumb(7));

        let result = resource_handle.get_preview(false).await;
        assert!(result.is_err());
    }

    /*
     * DtResourceRef::Tensor tests
     */
    #[tokio::test]
    async fn test_tensor_from_tensor() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::Tensor("tensor_history_265054268".to_string()),
        );

        let tensor = resource_handle.get_tensor().await.unwrap().unwrap();
        let data_len = match &tensor.data {
            TensorValue::F32(vec) => vec.len(),
            TensorValue::U8(vec) => vec.len(),
        };
        assert!(data_len > 0);
        assert!(data_len == (tensor.width * tensor.height * tensor.channels * tensor.n) as usize);
    }

    #[tokio::test]
    async fn test_preview_from_tensor() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::Tensor("tensor_history_265054268".to_string()),
        );

        let preview = resource_handle.get_preview(false).await.unwrap();
        assert!(preview.is_none());
    }

    #[tokio::test]
    async fn test_tensor_from_invalid_tensor() {
        let resource_handle =
            DtResourceHandle::new(&project_ref(), &DtResourceRef::Tensor("7".to_string()));

        let result = resource_handle.get_tensor().await;
        assert!(result.is_err());
    }

    /*
     * DtResourceRef::TensorData tests
     */
    #[tokio::test]
    async fn test_tensor_from_tensor_data_variants() {
        let canvas = ThnResource::Canvas(0);

        let rh_rowid = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(dtm_lib::projects_db::TdRef::RowId(2), canvas.clone()),
        );

        let rh_lineage_time = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(
                dtm_lib::projects_db::TdRef::LineageTime(0, 2),
                canvas.clone(),
            ),
        );

        let rh_lineage_time_idx = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(dtm_lib::projects_db::TdRef::LineageTimeIdx(0, 2, 0), canvas),
        );

        let tensor_rowid = rh_rowid.get_tensor().await.unwrap().unwrap();
        let data_len_rowid = match &tensor_rowid.data {
            TensorValue::F32(vec) => vec.len(),
            TensorValue::U8(vec) => vec.len(),
        };
        assert!(data_len_rowid > 0);
        assert!(
            data_len_rowid
                == (tensor_rowid.width
                    * tensor_rowid.height
                    * tensor_rowid.channels
                    * tensor_rowid.n) as usize
        );

        let tensor_lineage_time = rh_lineage_time.get_tensor().await.unwrap().unwrap();
        let tensor_lineage_time_idx = rh_lineage_time_idx.get_tensor().await.unwrap().unwrap();

        // ImageTensor doesn't implement Eq, so compare data vecs directly
        assert_vec_eq(
            tensor_lineage_time.as_f32().unwrap(),
            tensor_lineage_time_idx.as_f32().unwrap(),
            1e-6,
        );
    }

    #[tokio::test]
    async fn test_preview_from_tensor_data() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(
                dtm_lib::projects_db::TdRef::RowId(2),
                ThnResource::Canvas(0),
            ),
        );

        let preview = resource_handle.get_preview(false).await.unwrap();
        assert!(preview.is_none());
    }

    #[tokio::test]
    async fn test_tensor_from_invalid_tensor_data() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(
                dtm_lib::projects_db::TdRef::LineageTime(7, 2),
                ThnResource::Canvas(0),
            ),
        );

        let result = resource_handle.get_tensor().await.unwrap();
        assert!(result.is_none());
    }

    /*
     * DtResourceRef::TensorHistoryNode tests - additional
     */
    #[tokio::test]
    async fn test_tensor_from_thn_variants() {
        let canvas = ThnResource::Canvas(0);

        let rh_rowid = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), canvas.clone()),
        );

        let rh_lineage_time = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::LineageTime(0, 2), canvas),
        );

        let tensor_rowid = rh_rowid.get_tensor().await.unwrap().unwrap();
        let data_len_rowid = match &tensor_rowid.data {
            TensorValue::F32(vec) => vec.len(),
            TensorValue::U8(vec) => vec.len(),
        };
        assert!(data_len_rowid > 0);
        assert!(
            data_len_rowid
                == (tensor_rowid.width
                    * tensor_rowid.height
                    * tensor_rowid.channels
                    * tensor_rowid.n) as usize
        );

        let tensor_lineage_time = rh_lineage_time.get_tensor().await.unwrap().unwrap();

        // ImageTensor doesn't implement Eq, so compare data vecs directly
        assert_vec_eq(
            tensor_rowid.as_f32().unwrap(),
            tensor_lineage_time.as_f32().unwrap(),
            1e-6,
        );
    }

    #[tokio::test]
    async fn test_preview_from_thn_variants() {
        let canvas = ThnResource::Canvas(0);

        let rh_rowid = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), canvas.clone()),
        );

        let rh_lineage_time = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::LineageTime(0, 2), canvas),
        );

        let preview_rowid = rh_rowid.get_preview(false).await.unwrap().unwrap();
        let preview_lineage_time = rh_lineage_time.get_preview(false).await.unwrap().unwrap();

        assert!(preview_rowid.len() > 0);
        assert_eq!(preview_rowid, preview_lineage_time);
    }

    #[tokio::test]
    async fn test_tensor_from_invalid_thn() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(77), ThnResource::Canvas(0)),
        );

        let result = resource_handle.get_tensor().await.unwrap();
        assert!(result.is_none());
    }

    /*
     * get_lossless() tests
     */
    #[tokio::test]
    async fn test_lossless_from_thn_canvas() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(2), ThnResource::Canvas(0)),
        );

        let lossless = resource_handle.get_lossless(None).await.unwrap().unwrap();
        assert!(lossless.len() > 0);
        // Verify it's a PNG by checking the PNG signature
        assert_eq!(&lossless[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[tokio::test]
    async fn test_lossless_from_tensor() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::Tensor("tensor_history_265054268".to_string()),
        );

        let lossless = resource_handle.get_lossless(None).await.unwrap().unwrap();
        assert!(lossless.len() > 0);
        // Verify it's a PNG by checking the PNG signature
        assert_eq!(&lossless[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[tokio::test]
    async fn test_lossless_from_tensor_data() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorData(
                dtm_lib::projects_db::TdRef::RowId(2),
                ThnResource::Canvas(0),
            ),
        );

        let lossless = resource_handle.get_lossless(None).await.unwrap().unwrap();
        assert!(lossless.len() > 0);
        // Verify it's a PNG by checking the PNG signature
        assert_eq!(&lossless[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[tokio::test]
    async fn test_lossless_from_thumb() {
        let resource_handle = DtResourceHandle::new(&project_ref(), &DtResourceRef::Thumb(209719244));

        let lossless = resource_handle.get_lossless(None).await.unwrap();
        assert!(lossless.is_none());
    }

    #[tokio::test]
    async fn test_lossless_from_invalid_thn() {
        let resource_handle = DtResourceHandle::new(
            &project_ref(),
            &DtResourceRef::TensorHistoryNode(ThnRef::RowId(77), ThnResource::Canvas(0)),
        );

        let lossless = resource_handle.get_lossless(None).await.unwrap();
        assert!(lossless.is_none());
    }
}
