use std::collections::HashMap;

use rust_stemmers::{Algorithm, Stemmer};
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::OnceCell;

use crate::projects_db::{self, ListImagesOptions, ListImagesResult};

#[derive(Serialize, Clone, Debug)]
pub struct WordEntry {
    text: String,
    value: u32,
}

#[derive(Clone)]
struct WordInfo {
    stemmed: String,
    count: u32,
    original: HashMap<String, u32>,
}

impl WordInfo {
    fn new(stemmed: &str) -> Self {
        Self {
            stemmed: stemmed.to_string(),
            count: 0,
            original: HashMap::new(),
        }
    }
}

static CELL: OnceCell<Vec<WordEntry>> = OnceCell::const_new();

#[tauri::command]
pub async fn stem_all(app: tauri::AppHandle) -> Result<(), String> {
    // if CELL.initialized() {
    //     return Ok(CELL.get().unwrap().to_vec());
    // }

    let mut updates = 0;

    let db = projects_db::ProjectsDb::get().map_err(|e| e.to_string())?;
    let image_count = db.get_image_count().await.map_err(|e| e.to_string())?;

    let stemmer = Stemmer::create(Algorithm::English);
    let mut all_words: HashMap<String, WordInfo> = HashMap::new();

    for batch_start in (0..image_count).step_by(250) {
        let images = db
            .list_images(ListImagesOptions {
                skip: Some(batch_start as i32),
                take: Some(250),
                ..Default::default()
            })
            .await
            .map_err(|e| e.to_string())?;

        let ListImagesResult::Images(page) = images else {
            return Err("failed to list images".into());
        };

        for image in page.items {
            let Some(prompt) = image.prompt else { continue };

            let prompt = prompt.to_lowercase();

            for word in tokenize(&prompt) {
                let stem = stemmer.stem(&word).to_string();

                all_words
                    .entry(stem.clone())
                    .and_modify(|info| {
                        info.count += 1;
                        *info.original.entry(word.clone()).or_insert(0) += 1;
                    })
                    .or_insert_with(|| {
                        let mut info = WordInfo::new(&stem);
                        info.count = 1;
                        info.original.insert(word, 1);
                        info
                    });
            }
        }
        updates += 1;

        if updates % 10 == 0 {
          let word_entries = get_top_words(all_words.clone(), 40);
          app.emit("stem_all_progress", word_entries).unwrap();
        }

        let progress = (batch_start as f64 / image_count as f64) * 100.0;
        println!("{}", progress as u8);
    }

    // ---- optional: stop-word removal here ----
    // all_words.retain(|stem, _| !STOP_WORDS.contains(stem.as_str()));
    

    // CELL.set(word_entries.clone()).unwrap();

    // Ok(word_entries)

    Ok(())
}

fn get_top_words(all_words: HashMap<String, WordInfo>, count: u8) -> Vec<WordEntry> {
    let mut all_words = all_words.clone();

    for word in english_stop_words() {
        all_words.remove(word);
    }

    // ---- sort for word-cloud output ----
    let mut words: Vec<_> = all_words.values().collect();
    words.sort_by_key(|info| std::cmp::Reverse(info.count));

    let mut word_entries: Vec<WordEntry> = Vec::new();

    for info in words.iter().take(count as usize) {
        let (display, _) = info
            .original
            .iter()
            .max_by_key(|(_, count)| *count)
            .unwrap();

        // println!("{} {} {}", display, info.count, info.stemmed);

        word_entries.push(WordEntry {
            text: display.clone(),
            value: info.count,
        });
    }

    word_entries
}

fn tokenize(prompt: &str) -> Vec<String> {
    let mut cleaned = String::with_capacity(prompt.len());

    for c in prompt.chars() {
        if c.is_alphabetic() || c == '\'' {
            cleaned.push(c);
        } else {
            cleaned.push(' ');
        }
    }

    cleaned
        .split_whitespace()
        .map(|w| w.trim_matches('\''))
        .filter(|w| w.len() > 1)
        .map(|w| w.to_string())
        .collect()
}

pub fn english_stop_words() -> Vec<&'static str> {
    vec![
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "doing",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "has",
        "have",
        "having",
        "he",
        "her",
        "here",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "itself",
        "just",
        "me",
        "more",
        "most",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "now",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "she",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whom",
        "why",
        "with",
        "would",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
    ]
}
