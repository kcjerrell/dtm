use crate::bookmarks;
use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

pub static CACHE: Lazy<RwLock<HashMap<i64, PathBuf>>> = Lazy::new(|| RwLock::new(HashMap::new()));

pub async fn resolve_bookmark(id: i64, bookmark: &str) -> Result<bookmarks::ResolveResult> {
    let result = bookmarks::resolve_bookmark_impl(bookmark.to_string())
        .await
        .with_context(|| format!("failed to resolve bookmark for watch folder {id}"))?;

    match &result {
        bookmarks::ResolveResult::Resolved(path) => {
            CACHE.write().unwrap().insert(id, PathBuf::from(path));
        }
        bookmarks::ResolveResult::StaleRefreshed { resolved_path, .. } => {
            CACHE
                .write()
                .unwrap()
                .insert(id, PathBuf::from(resolved_path));
        }
        bookmarks::ResolveResult::CannotResolve => {
            // Optionally remove from cache if it was there?
            // For now just leave it as is or do nothing.
        }
    }

    Ok(result)
}

pub fn get_folder(id: i64) -> Option<String> {
    CACHE
        .read()
        .unwrap()
        .get(&id)
        .map(|p| p.to_str().unwrap().to_string())
}
