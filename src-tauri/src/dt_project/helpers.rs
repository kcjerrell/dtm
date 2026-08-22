use anyhow::{Context, Result};

pub fn split_tensor_name(name: &str) -> Result<(String, i64)> {
    if let Some((prefix, id)) = name.rsplit_once("_") {
        let id = id
            .parse::<i64>()
            .with_context(|| format!("failed to parse integer id from tensor name '{}'", name))?;
        Ok((prefix.to_string(), id))
    } else {
        anyhow::bail!("Invalid tensor name: {}", name)
    }
}