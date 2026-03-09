mod common;

#[cfg(test)]
mod tests {
    use crate::common::*;

    #[tokio::test]
    async fn search_images_simple() {
        // Use the sample db (contains existing images)
        let (dtps, _event_helper, _wfh, _db_path) = test_fixture(false, true).await;

        // Test simple search
        // list_images args: project_ids, search, filters, sort, direction, take, skip, count, show_video, show_image
        let result = dtps.list_images(
            None, 
            Some("skyscraper".to_string()), 
            None, None, None, None, None, None, None, None
        ).await.unwrap();
        
        assert!(result.total > 0, "Should find at least some images for 'skyscraper'");
        
        dtps.stop().await;
    }

    #[tokio::test]
    async fn search_images_phrase() {
        let (dtps, _event_helper, _wfh, _db_path) = test_fixture(false, true).await;

        // Test phrase search with quotes
        let result = dtps.list_images(
            None, 
            Some("\"futuristic city\"".to_string()), 
            None, None, None, None, None, None, None, None
        ).await.unwrap();
        assert!(result.total > 0, "Should find results for quoted phrase 'futuristic city'");

        dtps.stop().await;
    }

    #[tokio::test]
    async fn search_images_multiple_terms() {
        let (dtps, _event_helper, _wfh, _db_path) = test_fixture(false, true).await;

        // Test multiple terms (OR search by default in FTS)
        let result = dtps.list_images(
            None, 
            Some("snake skyscraper".to_string()), 
            None, None, None, None, None, None, None, None
        ).await.unwrap();
        // It should find both the skyscraper and the snake images
        assert!(result.total >= 2);

        dtps.stop().await;
    }

    #[tokio::test]
    async fn search_images_no_results() {
        let (dtps, _event_helper, _wfh, _db_path) = test_fixture(false, true).await;

        let result = dtps.list_images(
            None, 
            Some("nonexistent_term_xyz".to_string()), 
            None, None, None, None, None, None, None, None
        ).await.unwrap();
        assert_eq!(result.total, 0);

        dtps.stop().await;
    }
}

