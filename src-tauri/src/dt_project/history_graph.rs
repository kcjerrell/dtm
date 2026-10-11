use std::collections::HashMap;

use itertools::Itertools;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::{prelude::*, sqlite::SqliteRow};
use strum::EnumIs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryNode {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    #[serde(
        serialize_with = "serialize_parent_as_array",
        deserialize_with = "deserialize_parent_from_array"
    )]
    pub parent: Parent,
    #[serde(skip)]
    pub children: Vec<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tensor_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mask_name: Option<String>,
}

impl<'r> FromRow<'r, SqliteRow> for HistoryNode {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid = row.get("rowid");
        let lineage = row.get("__pk0");
        let logical_time = row.get("__pk1");

        Ok(HistoryNode {
            rowid,
            lineage,
            logical_time,
            parent: Parent::Unknown,
            children: Vec::new(),
            tensor_name: None,
            mask_name: None,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, EnumIs)]
pub enum Parent {
    Unknown,
    None,
    Found(i64),
    Ambiguous(Vec<i64>),
}

pub trait ParentExt {
    fn ids(self) -> Vec<i64>;
}

impl ParentExt for Option<&Parent> {
    fn ids(self) -> Vec<i64> {
        match self {
            Some(Parent::Found(id)) => vec![*id],
            Some(Parent::Ambiguous(ids)) => ids.clone(),
            _ => Vec::new(),
        }
    }
}

fn serialize_parent_as_array<S>(parent: &Parent, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match parent {
        Parent::Unknown => serializer.serialize_none(),
        Parent::None => serializer.serialize_none(),
        Parent::Found(id) => serializer.serialize_i64(*id),
        Parent::Ambiguous(ids) => ids.serialize(serializer),
    }
}

fn deserialize_parent_from_array<'de, D>(deserializer: D) -> Result<Parent, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ParentHelper {
        Single(i64),
        Multiple(Vec<i64>),
        None(Option<i64>),
    }

    let helper = ParentHelper::deserialize(deserializer)?;
    match helper {
        ParentHelper::Single(id) => Ok(Parent::Found(id)),
        ParentHelper::Multiple(ids) => {
            if ids.is_empty() {
                Ok(Parent::None)
            } else if ids.len() == 1 {
                Ok(Parent::Found(ids[0]))
            } else {
                Ok(Parent::Ambiguous(ids))
            }
        }
        ParentHelper::None(_) => Ok(Parent::None),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryGraph {
    #[serde(deserialize_with = "populate_children")]
    nodes: HashMap<i64, HistoryNode>,
}

fn populate_children<'de, D>(deserializer: D) -> Result<HashMap<i64, HistoryNode>, D::Error>
where
    D: Deserializer<'de>,
{
    let mut nodes: HashMap<i64, HistoryNode> = HashMap::deserialize(deserializer)?;

    // Build children relationships
    let mut children_map: HashMap<i64, Vec<i64>> = HashMap::new();

    for (rowid, node) in &nodes {
        match &node.parent {
            Parent::Found(parent_id) => {
                children_map.entry(*parent_id).or_default().push(*rowid);
            }
            Parent::Ambiguous(parent_ids) => {
                for parent_id in parent_ids {
                    children_map.entry(*parent_id).or_default().push(*rowid);
                }
            }
            _ => {}
        }
    }

    // Populate children field for each node
    for node in nodes.values_mut() {
        node.children = children_map.get(&node.rowid).cloned().unwrap_or_default();
    }

    Ok(nodes)
}

impl HistoryGraph {
    pub fn new(nodes: Vec<HistoryNode>) -> Self {
        let nodes_map = nodes.into_iter().map(|node| (node.rowid, node)).collect();
        Self { nodes: nodes_map }
    }

    pub fn get_node(&self, rowid: i64) -> Option<&HistoryNode> {
        self.nodes.get(&rowid)
    }

    pub fn get_parent(&self, rowid: i64) -> Option<&Parent> {
        self.get_node(rowid).map(|node| &node.parent)
    }

    pub fn nodes(&self) -> Vec<&HistoryNode> {
        self.nodes.values().collect()
    }

    pub fn to_dot(&self) -> String {
        let mut dot = String::from("digraph HistoryGraph {\n");
        dot.push_str("  node [shape=box];\n");
        dot.push_str("  rankdir=TB;\n");
        dot.push_str("\n");

        // Add nodes with labels
        for node in self.nodes.values().sorted_by_key(|n| n.rowid) {
            let label = format!("{}\\n{}:{}", node.rowid, node.lineage, node.logical_time);
            dot.push_str(&format!("  \"{}\" [label=\"{}\"];\n", node.rowid, label));
        }

        dot.push_str("\n");

        // Add edges from parent to child
        for node in self.nodes.values() {
            match &node.parent {
                Parent::Found(parent_id) => {
                    dot.push_str(&format!("  \"{}\" -> \"{}\";\n", parent_id, node.rowid));
                }
                Parent::Ambiguous(parent_ids) => {
                    for parent_id in parent_ids {
                        dot.push_str(&format!("  \"{}\" -> \"{}\";\n", parent_id, node.rowid));
                    }
                }
                _ => {}
            }
        }

        dot.push_str("}\n");
        dot
    }
}
