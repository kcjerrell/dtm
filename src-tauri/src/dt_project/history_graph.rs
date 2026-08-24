use std::collections::{HashMap, HashSet};

use anyhow::Context;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::{prelude::*, query_as, sqlite::SqliteRow};

use crate::dt_project::{DTProject, DTProjectTable};

type Rowid = i64;

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

#[derive(Debug, Serialize, Deserialize, Clone)]
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
        ParentHelper::None(opt) => Ok(Parent::None),
    }
}

impl From<&HistoryNode> for Rowid {
    fn from(value: &HistoryNode) -> Self {
        value.rowid
    }
}

#[derive(Debug, Default)]
pub struct HistoryGraphSolver {
    nodes: HashMap<i64, HistoryNode>,
    generations: HashMap<i64, Vec<i64>>,
    lineage_time_index: HashMap<(i64, i64), i64>,
    max_time_per_lineage: HashMap<i64, i64>,
    rowid_order: Vec<i64>,
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

impl HistoryGraphSolver {
    fn new() -> Self {
        Self::default()
    }

    pub fn add_nodes(&mut self, nodes: Vec<HistoryNode>) {
        for node in nodes {
            self.add_node(node);
        }
    }

    pub fn add_node(&mut self, node: HistoryNode) {
        let rowid = node.rowid;
        self.generations
            .entry(node.logical_time)
            .or_default()
            .push(rowid);
        self.lineage_time_index
            .insert((node.lineage, node.logical_time), rowid);
        self.max_time_per_lineage
            .entry(node.lineage)
            .and_modify(|max_time| *max_time = (*max_time).max(node.logical_time))
            .or_insert(node.logical_time);
        self.rowid_order.push(rowid);
        self.nodes.insert(rowid, node);
    }

    fn get_node(&self, rowid: &Rowid) -> &HistoryNode {
        self.nodes.get(rowid).expect("node must exist")
    }

    fn get_node_mut(&mut self, rowid: &Rowid) -> &mut HistoryNode {
        self.nodes.get_mut(rowid).expect("node must exist")
    }

    fn get_parent<T>(&self, node: T) -> &Parent
    where
        T: Into<Rowid>,
    {
        &self.get_node(&node.into()).parent
    }

    fn set_parent(&mut self, node: impl Into<Rowid>, parent: Parent) {
        let node = node.into();

        if let Parent::Found(found) = &parent {
            self.get_node_mut(found).children.push(node);
        }

        self.get_node_mut(&node).parent = parent;
    }

    fn node_at(&self, lineage: i64, logical_time: i64) -> Option<Rowid> {
        self.lineage_time_index
            .get(&(lineage, logical_time))
            .copied()
    }

    fn lineages_at_time(&self, logical_time: i64) -> HashSet<i64> {
        self.get_generation(logical_time)
            .iter()
            .map(|rowid| self.get_node(rowid).lineage)
            .collect()
    }

    fn previous_rowid(&self, rowid: Rowid) -> Option<Rowid> {
        self.rowid_order
            .iter()
            .position(|r| *r == rowid)
            .and_then(|idx| idx.checked_sub(1))
            .map(|idx| self.rowid_order[idx])
    }

    fn is_linear_continuation(&self, rowid: Rowid) -> bool {
        let node = self.get_node(&rowid);
        if node.logical_time == 1 {
            return false;
        }
        self.node_at(node.lineage, node.logical_time - 1).is_some()
    }

    fn parent_rowid(&self, rowid: Rowid) -> Option<Rowid> {
        match self.get_parent(rowid) {
            Parent::Found(parent) => Some(*parent),
            _ => None,
        }
    }

    /// All nodes at T-1 that existed when this node was inserted.
    fn fork_candidates(&self, rowid: Rowid) -> Vec<Rowid> {
        let node = self.get_node(&rowid);
        let logical_time = node.logical_time;
        if logical_time <= 1 {
            return Vec::new();
        }

        self.get_generation(logical_time - 1)
            .iter()
            .filter(|candidate| **candidate < rowid)
            .copied()
            .collect()
    }

    /// Same-time fork parent: active node when pushHistory did not advance logical time.
    fn same_time_fork_parent(&self, rowid: Rowid) -> Option<Rowid> {
        let node = self.get_node(&rowid);
        let logical_time = node.logical_time;

        let same_time: Vec<Rowid> = self
            .get_generation(logical_time)
            .iter()
            .filter(|candidate| {
                **candidate < rowid && self.get_node(candidate).lineage != node.lineage
            })
            .copied()
            .collect();

        match same_time.len() {
            0 => None,
            1 => Some(same_time[0]),
            _ => self
                .previous_rowid(rowid)
                .filter(|prev| same_time.contains(prev))
                .or_else(|| same_time.iter().max().copied()),
        }
    }

    fn disambiguate_fork_candidates(&self, rowid: Rowid, mut candidates: Vec<Rowid>) -> Vec<Rowid> {
        if candidates.len() <= 1 {
            return candidates;
        }

        // let prev = self.previous_rowid(rowid)?;
        // let prev_node = self.node(&prev);

        let node = self.get_node(&rowid);
        let logical_time = node.logical_time;

        // if candidate with same lineage, it's our parent
        if let Some(same_lin) = candidates
            .iter()
            .find(|candidate| self.get_node(candidate).lineage == node.lineage)
        {
            return vec![*same_lin];
        }

        // we can eliminate candidates that are the last node of their lineage, because this one would have
        // continued it
        // candidates.retain(|candidate| {
        //     let candidate_node = self.node(candidate);
        //     let max_time = self
        //         .max_time_per_lineage
        //         .get(&candidate_node.lineage)
        //         .copied()
        //         .unwrap_or(0);
        //     candidate_node.logical_time < max_time
        // });

        // Previous insertion was the active branch when this node was pushed.
        // if prev_node.logical_time == logical_time {
        //     if self.is_linear_continuation(prev) {
        //         // Content fork from the branch point: parent is at T-1, not the same-time node.
        //         if let Some(parent) = self.parent_rowid(prev).filter(|p| candidates.contains(p)) {
        //             return Some(parent);
        //         }
        //     } else if candidates.contains(&prev) {
        //         // Empty same-time fork from a non-linear active node.
        //         return Some(prev);
        //     }
        // }

        // if prev_node.logical_time == logical_time - 1 && candidates.contains(&prev) {
        //     return Some(prev);
        // }

        // candidates
        //     .iter()
        //     .find(|candidate| self.node(candidate).lineage == prev_node.lineage)
        //     .copied()
        //     .or_else(|| self.parent_rowid(prev).filter(|p| candidates.contains(p)))

        candidates
    }

    fn resolve_parent(&self, rowid: Rowid) -> Parent {
        let node = self.get_node(&rowid);
        let lineage = node.lineage;
        let logical_time = node.logical_time;

        if logical_time == 1 {
            return Parent::None;
        }

        // pushHistory always forks from the active node. Linear continuation keeps lineage
        // and increments logical time (or overwrites at the same time after reassignment).
        if let Some(parent) = self.node_at(lineage, logical_time - 1) {
            return Parent::Found(parent);
        }

        // Fork from an older node: parent is at T-1 on the active branch.
        let candidates = self.fork_candidates(rowid);
        if !candidates.is_empty() {
            let candidates = self.disambiguate_fork_candidates(rowid, candidates);
            return match candidates.len() {
                1 => Parent::Found(candidates[0]),
                _ => Parent::Ambiguous(candidates),
            };
        }

        // Same-time empty fork: new lineage at the same logical time as the active node.
        if let Some(parent) = self.same_time_fork_parent(rowid) {
            return Parent::Found(parent);
        }

        Parent::Unknown
    }

    pub fn resolve_parents(&mut self) {
        let rowids = self.rowid_order.clone();
        for rowid in rowids {
            let parent = self.resolve_parent(rowid);
            self.set_parent(rowid, parent);
        }
    }

    fn get_generation(&self, logical_time: i64) -> Vec<i64> {
        self.generations
            .get(&logical_time)
            .cloned()
            .unwrap_or_default()
    }

    pub fn solve(nodes: Vec<HistoryNode>) -> HistoryGraph {
        let mut solver = Self::new();
        solver.add_nodes(nodes);
        solver.resolve_parents();

        HistoryGraph {
            nodes: solver.nodes,
        }
    }
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
        for node in self.nodes.values() {
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

impl DTProject {
    pub async fn get_node_lineages(&self) -> anyhow::Result<Vec<HistoryNode>> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;
        let nodes: Vec<HistoryNode> =
            query_as("SELECT rowid, __pk0, __pk1 FROM tensorhistorynode ORDER BY rowid ASC")
                .fetch_all(&*self.pool)
                .await
                .with_context(|| {
                    format!(
                        "failed to query node lineages in project database {}",
                        self.path
                    )
                })?;

        Ok(nodes)
    }
}
