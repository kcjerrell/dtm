use super::fbs;
use crate::projects_db::dtos::text::{TextType, TextRange, TextModification, TextHistoryNode};
use serde::Serialize;
use std::sync::Mutex;


impl From<fbs::TextType> for TextType {
    fn from(fb: fbs::TextType) -> Self {
        match fb {
            fbs::TextType::PositiveText => TextType::PositiveText,
            fbs::TextType::NegativeText => TextType::NegativeText,
            _ => TextType::PositiveText,
        }
    }
}


impl From<&fbs::TextRange> for TextRange {
    fn from(fb: &fbs::TextRange) -> Self {
        Self {
            location: fb.location(),
            length: fb.length(),
        }
    }
}


impl TryFrom<fbs::TextModification<'_>> for TextModification {
    type Error = flatbuffers::InvalidFlatbuffer;

    fn try_from(fb: fbs::TextModification<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            modification_type: fb.type_().into(),
            range: fb.range().map(Into::into).unwrap_or_default(),
            text: fb.text().unwrap_or("").to_string(),
        })
    }
}


impl TryFrom<&[u8]> for TextHistoryNode {
    type Error = flatbuffers::InvalidFlatbuffer;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        let node = fbs::root_as_text_history_node(bytes)?;

        let modifications = node
            .modifications()
            .map(|v| {
                v.iter()
                    .map(|m| TextModification::try_from(m))
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?
            .unwrap_or_default();

        Ok(Self {
            lineage: node.lineage(),
            logical_time: node.logical_time(),
            start_edits: node.start_edits(),
            start_positive_text: node.start_positive_text().unwrap_or("").to_string(),
            start_negative_text: node.start_negative_text().unwrap_or("").to_string(),
            modifications,
        })
    }
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct PromptPair {
    pub positive: String,
    pub negative: String,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    lineage: i64,
    edits: i64,
    prompts: PromptPair,
}

pub struct TextHistory {
    pub nodes: Vec<TextHistoryNode>,
    cache: Mutex<Option<CacheEntry>>,
}

impl TextHistory {
    pub fn new(nodes: Vec<TextHistoryNode>) -> Self {
        Self {
            nodes,
            cache: Mutex::new(None),
        }
    }

    pub fn get_edit(&self, lineage: i64, text_edits: i64) -> Option<PromptPair> {
        // 1. Find the appropriate node to start from.
        // We look for a node with the same lineage and start_edits <= text_edits.
        // We pick the one with the highest start_edits among matches.
        let node = self
            .nodes
            .iter()
            .filter(|n| n.lineage == lineage && n.start_edits <= text_edits)
            .max_by_key(|n| n.start_edits)?;

        // 2. Determine starting point (Node or Cache).
        let mut prompts = PromptPair {
            positive: node.start_positive_text.clone(),
            negative: node.start_negative_text.clone(),
        };
        let mut current_edits = node.start_edits;

        // Try to use cache if relevant
        {
            let mut cache = self.cache.lock().unwrap();

            // Check if we have an exact match in the cache
            if let Some(entry) = &*cache {
                if entry.lineage == lineage && entry.edits == text_edits {
                    return Some(entry.prompts.clone());
                }
            }

            // Check if cache is a valid intermediate point
            if let Some(entry) = &*cache {
                if entry.lineage == lineage
                    && entry.edits <= text_edits
                    && entry.edits >= node.start_edits
                {
                    // Cache is valid and fresher/equal to node start
                    prompts = entry.prompts.clone();
                    current_edits = entry.edits;
                }
            }

            // 3. Apply modifications
            // Calculate index range to apply
            let start_index = (current_edits - node.start_edits) as usize;
            let end_index = (text_edits - node.start_edits) as usize;

            // Ensure we don't go out of bounds of the modifications vector
            let available_mods = node.modifications.len();
            let safe_end_index = end_index.min(available_mods);

            if start_index < safe_end_index {
                for modification in &node.modifications[start_index..safe_end_index] {
                    match modification.modification_type {
                        TextType::PositiveText => {
                            apply_modification(&mut prompts.positive, modification)
                        }
                        TextType::NegativeText => {
                            apply_modification(&mut prompts.negative, modification)
                        }
                    }
                }
                current_edits = node.start_edits + safe_end_index as i64;
            }

            // 4. Update cache
            *cache = Some(CacheEntry {
                lineage,
                edits: current_edits, // This should be text_edits if we completed successfully
                prompts: prompts.clone(),
            });
        }

        Some(prompts)
    }
}

fn apply_modification(text: &mut String, modification: &TextModification) {
    let mut chars: Vec<char> = text.chars().collect();
    let location = modification.range.location as usize;
    let length = modification.range.length as usize;

    if location > chars.len() {
        // Out of bounds - append
        chars.extend(modification.text.chars());
    } else {
        // safely clamp length
        let end = (location + length).min(chars.len());

        // Remove range
        chars.drain(location..end);

        // Insert new text
        let new_chars: Vec<char> = modification.text.chars().collect();
        chars.splice(location..location, new_chars);
    }

    *text = chars.into_iter().collect();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_text_history_reconstruction() {
        // Load sample data
        let sample_path = "src/projects_db/text_history_sample.json";

        // check if running from src-tauri or root. Usually tests run from crate root (src-tauri)
        let content = fs::read_to_string(sample_path)
            .or_else(|_| fs::read_to_string("src-tauri/src/projects_db/text_history_sample.json"))
            .expect("Failed to read sample file");

        let nodes: Vec<TextHistoryNode> =
            serde_json::from_str(&content).expect("Failed to parse JSON");
        let history = TextHistory::new(nodes);

        // Test Case 1: Start of a node (Lineage 2, Edit 0)
        let res0 = history.get_edit(2, 0).unwrap();
        assert_eq!(res0.positive, "");

        // Test Case 2: Apply first modification
        // Mod 0 (edit state 1?): Text "war in space..."
        // edit 1 request should include mod 0.
        let res1 = history.get_edit(2, 1).unwrap();
        assert!(res1.positive.starts_with("war in space"));

        // Test Case 3: Verify Cache (Access 1 again)
        let res1_cached = history.get_edit(2, 1).unwrap();
        assert_eq!(res1, res1_cached);

        // Test Case 4: Sequential Access (Forward Play)
        // Access edit 2. Mod 1 "3d fluffy llama".
        let res2 = history.get_edit(2, 2).unwrap();
        assert!(res2.positive.starts_with("3d fluffy llama"));
        assert!(!res2.positive.contains("war in space"));

        // Test Case 5: Jump to later node (Lineage 2, Edit 50)
        let res50 = history.get_edit(2, 50).unwrap();
        assert_eq!(res50.positive, "an ugly turke");

        // Test Case 6: Sequential after jump
        let res51 = history.get_edit(2, 51).unwrap();
        assert_eq!(res51.positive, "an ugly turkey");

        // Test Case 7: Backwards jump (Edit 2 again)
        let res2_back = history.get_edit(2, 2).unwrap();
        assert!(res2_back.positive.starts_with("3d fluffy llama"));
    }
}
