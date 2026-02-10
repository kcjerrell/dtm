use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub enum TextType {
    PositiveText,
    NegativeText,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
pub struct TextRange {
    pub location: i32,
    pub length: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TextModification {
    pub modification_type: TextType,
    pub range: TextRange,
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TextHistoryNode {
    pub lineage: i64,
    pub logical_time: i64,
    pub start_edits: i64,
    pub start_positive_text: String,
    pub start_negative_text: String,
    pub modifications: Vec<TextModification>,
}
