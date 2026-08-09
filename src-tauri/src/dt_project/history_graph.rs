use std::{
    collections::{HashMap, HashSet},
    process::Command,
};

use itertools::Itertools;
use sqlx::{prelude::*, query_as, sqlite::SqliteRow};
use tempfile::NamedTempFile;

use crate::dt_project::{DTProject, DTProjectTable};

type Rowid = i64;

#[derive(Debug)]
pub struct HistoryNode {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub parent: Parent,
    pub children: Vec<i64>,
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
        })
    }
}

#[derive(Debug)]
pub enum Parent {
    Unknown,
    None,
    Found(i64),
    Ambiguous(Vec<i64>),
}

impl From<&HistoryNode> for Rowid {
    fn from(value: &HistoryNode) -> Self {
        value.rowid
    }
}

#[derive(Debug, Default)]
pub struct HistoryGraph {
    nodes: HashMap<i64, HistoryNode>,
    generations: HashMap<i64, Vec<i64>>,
    lineage_time_index: HashMap<(i64, i64), i64>,
    max_time_per_lineage: HashMap<i64, i64>,
    rowid_order: Vec<i64>,
}

impl HistoryGraph {
    pub fn new() -> Self {
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

    pub fn node(&self, rowid: &Rowid) -> &HistoryNode {
        self.nodes.get(rowid).expect("node must exist")
    }

    fn node_mut(&mut self, rowid: &Rowid) -> &mut HistoryNode {
        self.nodes.get_mut(rowid).expect("node must exist")
    }

    pub fn parent<T>(&self, node: T) -> &Parent
    where
        T: Into<Rowid>,
    {
        &self.node(&node.into()).parent
    }

    pub fn set_parent(&mut self, node: impl Into<Rowid>, parent: Parent) {
        let node = node.into();

        if let Parent::Found(found) = &parent {
            self.node_mut(found).children.push(node);
        }

        self.node_mut(&node).parent = parent;
    }

    fn node_at(&self, lineage: i64, logical_time: i64) -> Option<Rowid> {
        self.lineage_time_index
            .get(&(lineage, logical_time))
            .copied()
    }

    fn lineages_at_time(&self, logical_time: i64) -> HashSet<i64> {
        self.get_generation(logical_time)
            .iter()
            .map(|rowid| self.node(rowid).lineage)
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
        let node = self.node(&rowid);
        if node.logical_time == 1 {
            return false;
        }
        self.node_at(node.lineage, node.logical_time - 1).is_some()
    }

    fn parent_rowid(&self, rowid: Rowid) -> Option<Rowid> {
        match self.parent(rowid) {
            Parent::Found(parent) => Some(*parent),
            _ => None,
        }
    }

    /// All nodes at T-1 that existed when this node was inserted.
    fn fork_candidates(&self, rowid: Rowid) -> Vec<Rowid> {
        let node = self.node(&rowid);
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
        let node = self.node(&rowid);
        let logical_time = node.logical_time;

        let same_time: Vec<Rowid> = self
            .get_generation(logical_time)
            .iter()
            .filter(|candidate| **candidate < rowid && self.node(candidate).lineage != node.lineage)
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

        let node = self.node(&rowid);
        let logical_time = node.logical_time;

        // if candidate with same lineage, it's our parent
        if let Some(same_lin) = candidates
            .iter()
            .find(|candidate| self.node(candidate).lineage == node.lineage)
        {
            return vec![*same_lin];
        }

        // we can eliminate candidates that are the last node of their lineage, because this one would have
        // continued it
        candidates.retain(|candidate| {
            let candidate_node = self.node(candidate);
            let max_time = self
                .max_time_per_lineage
                .get(&candidate_node.lineage)
                .copied()
                .unwrap_or(0);
            candidate_node.logical_time < max_time
        });

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
        let node = self.node(&rowid);
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

    pub fn get_generation(&self, logical_time: i64) -> Vec<i64> {
        self.generations
            .get(&logical_time)
            .cloned()
            .unwrap_or_default()
    }

    pub fn stats(&self) -> (usize, usize, usize) {
        let mut found = 0;
        let mut ambiguous = 0;
        let mut unknown = 0;

        for node in self.nodes.values() {
            match node.parent {
                Parent::Found(_) | Parent::None => found += 1,
                Parent::Ambiguous(_) => ambiguous += 1,
                Parent::Unknown => unknown += 1,
            }
        }

        (found, ambiguous, unknown)
    }

    /// Save the graph as an SVG file using graphviz dot command.
    /// Returns an error if graphviz is not available or the command fails.
    pub fn save_graph(&self, svg_path: &str) -> anyhow::Result<()> {
        // Check if dot command is available
        let which_result = Command::new("which").arg("dot").output();
        match &which_result {
            Ok(output) if output.status.success() => {}
            _ => {
                return Err(anyhow::anyhow!(
                    "graphviz 'dot' command not found in PATH. Please install graphviz to use save_graph."
                ));
            }
        }

        let mut output = "digraph {{".to_string();
        let mut list = Vec::new();

        for node in self.nodes.values().sorted_by_key(|n| n.rowid) {
            list.push(format!(
                "({}) {}:{}",
                node.rowid, node.lineage, node.logical_time,
            ));
            match &node.parent {
                Parent::Found(parent) => {
                    let parent = self.node(parent);
                    output.push_str(&format!(
                        "\n    \"{}:{}\" -> \"{}:{}\";",
                        parent.lineage, parent.logical_time, node.lineage, node.logical_time
                    ));
                }
                Parent::Ambiguous(items) => {
                    for parent in items {
                        let parent = self.node(parent);
                        output.push_str(&format!(
                            "\n    \"{}:{}\" -> \"{}:{}\" [color=gray];",
                            parent.lineage, parent.logical_time, node.lineage, node.logical_time
                        ));
                    }
                }
                Parent::Unknown => {
                    output.push_str(&format!(
                        "\n \"{}:{}\" [color=red];",
                        node.lineage, node.logical_time
                    ));
                }
                Parent::None => {}
            }
        }

        output.push_str("\n}}");

        // Create parent directory if it doesn't exist
        if let Some(parent) = std::path::Path::new(svg_path).parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Use tempfile for the .dot file
        let dot_file = NamedTempFile::new()?;
        std::fs::write(&dot_file, output)?;

        // Run dot command to generate SVG
        let output = Command::new("dot")
            .args(["-Tsvg", "-o", svg_path, dot_file.path().to_str().unwrap()])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "dot command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }
}

impl DTProject {
    pub(crate) async fn get_node_lineages(&self) -> anyhow::Result<Vec<HistoryNode>> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;
        let nodes: Vec<HistoryNode> =
            query_as("SELECT rowid, __pk0, __pk1, p FROM tensorhistorynode ORDER BY rowid ASC")
                .fetch_all(&*self.pool)
                .await?;

        Ok(nodes)
    }
}
