use entity::images;
use sea_orm::{ExprTrait, QueryFilter, Select};
use sea_query::{Expr, SimpleExpr};

pub fn add_search(mut query: Select<images::Entity>, search_text: &str) -> Select<images::Entity> {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return query;
    }

    // 1. Extract quoted phrases
    let mut phrases = Vec::new();
    let mut remainder = String::new();

    let mut in_quotes = false;
    let mut current = String::new();

    for c in search_text.chars() {
        match c {
            '"' => {
                if in_quotes {
                    phrases.push(current.clone());
                    current.clear();
                }
                in_quotes = !in_quotes;
            }
            _ => {
                if in_quotes {
                    current.push(c);
                } else {
                    remainder.push(c);
                }
            }
        }
    }

    // 2. Apply phrase filters (AND)
    for phrase in &phrases {
        let like = format!("%{}%", phrase);
        query = query.filter(Expr::col(images::Column::Prompt).like(like));
    }

    // 3. Remaining terms → FTS OR query
    remainder = process_prompt(&remainder);
    let terms: Vec<&str> = remainder.split_whitespace().collect();

    println!("terms: {:#?}", terms);
    println!("phrases: {:#?}", phrases);

    if !terms.is_empty() {
        let fts_query = terms.join(" OR ");

        query = query.filter(Expr::cust_with_expr(
            "images.id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?)",
            SimpleExpr::value(fts_query),
        ));
    }

    query
}

pub fn process_prompt(prompt: &str) -> String {
    use unicode_normalization::UnicodeNormalization;

    let mut prompt = prompt.nfkc().collect::<String>();
    prompt = prompt.to_lowercase();
    prompt = prompt.replace(
        [
            ',', // common prompt separators
            '|', '\n', '\r', '\t', ';', ':',
            // brackets / grouping (usually not meaningful for search)
            '(', ')', '[', ']', '{', '}', // prompt syntax noise
            '<', '>', '=', '+', '*', '~',
            // quotes (normalize to spaces, phrase search uses user input)
            '"', '“', '”', '‘', '’', // slashes
            '/', '\\',
        ],
        " ",
    );

    prompt.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_prompt() {
        let prompt = "(masterpiece), woman | cyber-punk portrait";
        let processed = process_prompt(prompt);
        assert_eq!(processed, "masterpiece woman cyber-punk portrait");

        let prompt = "<lora:facefix:1.0> close-up, woman's face";
        let processed = process_prompt(prompt);
        assert_eq!(processed, "lora facefix 1.0 close-up woman's face");
    }
}
