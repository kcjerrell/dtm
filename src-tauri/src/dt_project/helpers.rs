use anyhow::{Context, Result};

pub fn split_tensor_name(name: &str) -> Result<(String, i64)> {
    name.rsplit_once("_")
        .and_then(|(prefix, id)| {
            id.parse::<i64>()
                .ok()
                .map(|id64| (prefix.to_string(), id64))
        })
        .ok_or_else(|| anyhow::anyhow!("invalid tensor name: {}", name))
}
