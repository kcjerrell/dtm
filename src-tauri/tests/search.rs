mod common;

#[cfg(test)]
mod tests {
    use crate::common::projects::WatchFolderHelper;
    use crate::common::*;
    use dtm_lib::dtp_service::DTPService;

    async fn load_sample_projects(
        dtps: &DTPService,
        event_helper: &EventHelper,
        wfh: &WatchFolderHelper,
    ) {
        // `connect` queues an initial sync. Let it finish before adding a folder,
        // otherwise the two syncs can import the fixture concurrently.
        assert!(event_helper.wait_for_count("sync_complete", 1).await);
        event_helper.reset_counts();

        wfh.copy_all();
        dtps.add_watchfolder(wfh.watchfolder_path.clone(), wfh.bookmark.clone())
            .await
            .unwrap();
        assert!(
            event_helper
                .wait_for_count("project_sync_complete", wfh.get_count())
                .await
        );
        dtps.get_db().await.unwrap().rebuild_images_fts().await.unwrap();
    }

    #[tokio::test]
    async fn search_images() {
        let (dtps, event_helper, wfh, _db_path) = test_fixture(false, false).await;
        load_sample_projects(&dtps, &event_helper, &wfh).await;

        let all_images = dtps
            .list_images(
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(true),
            )
            .await
            .unwrap()
            .images
            .unwrap();
        assert!(
            all_images.len() >= 2,
            "The sample projects should contain images"
        );

        let first_prompt = &all_images[0].prompt;
        let mut words = first_prompt.split_whitespace().filter(|w| w.len() > 4);
        let first_word = words
            .next()
            .unwrap()
            .trim_matches(|c: char| !c.is_alphanumeric());
        let phrase = format!("\"{} {}\"", first_word, words.next().unwrap());

        println!("Searching for {}", first_word);

        let simple = dtps
            .list_images(
                None,
                Some(first_word.to_string()),
                None,
                Some(phrase),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(true),
            )
            .await
            .unwrap();
        assert!(simple.total > 0, "A prompt term should be searchable");

        let phrase_result = dtps
            .list_images(
                None,
                Some(phrase),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(true),
            )
            .await
            .unwrap();
        assert!(
            phrase_result.total > 0,
            "A quoted prompt phrase should be searchable"
        );

        let multiple_terms = dtps
            .list_images(
                None,
                Some("snake skyscraper".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(true),
            )
            .await
            .unwrap();
        assert!(
            multiple_terms.total >= 2,
            "Multiple terms should use OR matching"
        );

        let no_results = dtps
            .list_images(
                None,
                Some("nonexistent_term_xyz".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(true),
            )
            .await
            .unwrap();
        assert_eq!(no_results.total, 0);

        dtps.stop().await;
    }
}
