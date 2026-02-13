use crate::bookmarks;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

pub static CACHE: Lazy<RwLock<HashMap<i64, PathBuf>>> = Lazy::new(|| RwLock::new(HashMap::new()));

pub async fn resolve_bookmark(id: i64, bookmark: &str) -> Result<String, String> {
    let path = bookmarks::resolve_bookmark(bookmark.to_string())
        .await
        .unwrap();
    CACHE.write().unwrap().insert(id, path.to_string().into());
    Ok(path)
}

pub fn get_folder(id: i64) -> Option<String> {
    CACHE.read().unwrap().get(&id).map(|p| p.to_str().unwrap().to_string())
}
