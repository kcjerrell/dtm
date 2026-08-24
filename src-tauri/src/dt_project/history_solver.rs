use std::collections::{BTreeSet, HashMap, HashSet};

use crate::dt_project::{HistoryGraph, HistoryNode, Parent, ParentExt};

type ParentSets = HashMap<i64, BTreeSet<i64>>;

#[derive(Clone, Default)]
struct SearchResult {
    valid: bool,
    parents: ParentSets,
}

struct SearchFrame {
    key: String,
    added_rowid: i64,
    candidates: std::vec::IntoIter<(Vec<i64>, Vec<i64>)>,
    pending: Option<(String, Vec<i64>)>,
    result: SearchResult,
}

struct Solver {
    nodes: Vec<HistoryNode>,
    exact_memo: HashMap<String, SearchResult>,
    relaxed_memo: HashMap<String, SearchResult>,
    exact_stack: Vec<SearchFrame>,
    relaxed_stack: Vec<SearchFrame>,
}

pub struct HistorySolver;

impl HistorySolver {
    /// Infers every parent which is compatible with the persisted history.
    ///
    /// The exact pass reverses the lineage rewrites performed by Draw Things'
    /// `pushHistory`, and then replays the transition for each candidate
    /// parent.  Some project tables have been changed by deletion or written
    /// by older Draw Things versions; when their internal state cannot be
    /// reproduced from rowid/lineage/logical_time alone, a constrained reverse
    /// pass preserves the useful parent candidates which remain observable.
    pub fn solve(mut nodes: Vec<HistoryNode>) -> HistoryGraph {
        nodes.sort_by_key(|node| node.rowid);
        if nodes.is_empty() {
            return HistoryGraph::new(nodes);
        }

        let final_lineages: Vec<i64> = nodes.iter().map(|node| node.lineage).collect();
        let mut solver = Solver {
            nodes,
            exact_memo: HashMap::new(),
            relaxed_memo: HashMap::new(),
            exact_stack: Vec::new(),
            relaxed_stack: Vec::new(),
        };

        let exact = solver.exact_search(solver.nodes.len(), final_lineages.clone());
        let relaxed =
            (!exact.valid).then(|| solver.relaxed_search(solver.nodes.len(), final_lineages));
        let time_fallback = (!exact.valid).then(|| solver.time_reduced_candidates());
        let result = if exact.valid {
            exact
        } else if relaxed.as_ref().is_some_and(|result| result.valid) {
            relaxed.expect("checked above")
        } else {
            time_fallback.clone().expect("only absent for exact result")
        };

        let fallback_parents = time_fallback.map(|result| result.parents);
        solver.into_graph(result.parents, fallback_parents)
    }
}

impl Solver {
    fn exact_search(&mut self, count: usize, lineages: Vec<i64>) -> SearchResult {
        let key = state_key(count, &lineages);
        if let Some(cached) = self.exact_memo.get(&key) {
            return cached.clone();
        }

        self.push_exact_state(count, lineages);
        self.resolve_exact_stack();
        self.exact_memo
            .get(&key)
            .cloned()
            .expect("root exact-search state must be resolved")
    }

    fn push_exact_state(&mut self, count: usize, lineages: Vec<i64>) {
        let key = state_key(count, &lineages);
        if self.exact_memo.contains_key(&key) {
            return;
        }

        if count == 1 {
            self.exact_memo.insert(
                key,
                SearchResult {
                    valid: lineages.first().copied() == Some(0),
                    parents: ParentSets::new(),
                },
            );
            return;
        }

        let Some((added_rowid, added_time)) = self
            .nodes
            .get(count - 1)
            .map(|node| (node.rowid, node.logical_time))
        else {
            self.exact_memo.insert(key, SearchResult::default());
            return;
        };
        let Some(previous_time) = self.nodes.get(count - 2).map(|node| node.logical_time) else {
            self.exact_memo.insert(key, SearchResult::default());
            return;
        };
        let before = lineages[..count - 1].to_vec();
        let Some(max_before) = before.last().copied() else {
            self.exact_memo.insert(key, SearchResult::default());
            return;
        };
        let Some(added_lineage) = lineages.get(count - 1).copied() else {
            self.exact_memo.insert(key, SearchResult::default());
            return;
        };

        let mut predecessors = Vec::new();
        match added_lineage - max_before {
            0 | 1 => predecessors.push(before),
            2 => {
                for parent_time in [added_time, added_time - 1] {
                    if parent_time < 0 {
                        continue;
                    }
                    for can_overwrite in [false, true] {
                        for old_lineage in 0..=max_before {
                            if let Some(restored) = self.undo_rewrite(
                                &before,
                                parent_time,
                                max_before,
                                old_lineage,
                                can_overwrite,
                            ) {
                                predecessors.push(restored);
                            }
                        }
                    }
                }
            }
            _ => {
                self.exact_memo.insert(key, SearchResult::default());
                return;
            }
        }

        let mut seen = HashSet::new();
        let mut candidates = Vec::new();
        for predecessor in predecessors {
            if !seen.insert(lineage_key(&predecessor)) {
                continue;
            }
            let parent_ids =
                self.parents_that_produce(&predecessor, &lineages, count - 1, previous_time);
            if parent_ids.is_empty() {
                continue;
            }
            candidates.push((predecessor, parent_ids));
        }

        self.exact_stack.push(SearchFrame {
            key,
            added_rowid,
            candidates: candidates.into_iter(),
            pending: None,
            result: SearchResult::default(),
        });
    }

    fn resolve_exact_stack(&mut self) {
        enum Action {
            Merge(String, Vec<i64>),
            Visit(Vec<i64>, Vec<i64>),
            Finish,
        }

        while !self.exact_stack.is_empty() {
            let action = {
                let frame = self.exact_stack.last_mut().expect("stack is not empty");
                if let Some((key, parent_ids)) = frame.pending.take() {
                    Action::Merge(key, parent_ids)
                } else if let Some((predecessor, parent_ids)) = frame.candidates.next() {
                    Action::Visit(predecessor, parent_ids)
                } else {
                    Action::Finish
                }
            };

            match action {
                Action::Merge(key, parent_ids) => {
                    let earlier = self
                        .exact_memo
                        .get(&key)
                        .cloned()
                        .expect("child exact-search state must be resolved");
                    if earlier.valid {
                        let frame = self.exact_stack.last_mut().expect("stack is not empty");
                        frame.result.valid = true;
                        merge_parent_sets(&mut frame.result.parents, &earlier.parents);
                        add_candidates(&mut frame.result.parents, frame.added_rowid, parent_ids);
                    }
                }
                Action::Visit(predecessor, parent_ids) => {
                    let count = predecessor.len();
                    let key = state_key(count, &predecessor);
                    self.exact_stack
                        .last_mut()
                        .expect("stack is not empty")
                        .pending = Some((key, parent_ids));
                    self.push_exact_state(count, predecessor);
                }
                Action::Finish => {
                    let frame = self.exact_stack.pop().expect("stack is not empty");
                    self.exact_memo.insert(frame.key, frame.result);
                }
            }
        }
    }

    fn undo_rewrite(
        &self,
        after: &[i64],
        parent_time: i64,
        max_before: i64,
        old_lineage: i64,
        can_overwrite: bool,
    ) -> Option<Vec<i64>> {
        let middle = max_before + 1;
        let top = max_before + 2;
        let mut restored = after.to_vec();

        for (index, lineage) in after.iter().copied().enumerate() {
            let node = self.nodes.get(index)?;
            let becomes_top = if can_overwrite {
                node.logical_time <= parent_time
            } else {
                node.logical_time < parent_time
            };
            let expected = if becomes_top { top } else { middle };
            if lineage == expected {
                restored[index] = old_lineage;
            } else if lineage == middle || lineage == top {
                return None;
            }
        }
        Some(restored)
    }

    fn parents_that_produce(
        &self,
        before: &[i64],
        after: &[i64],
        added_index: usize,
        max_logical_time_before: i64,
    ) -> Vec<i64> {
        let mut parents = Vec::new();
        for parent_index in 0..before.len() {
            let Some(parent) = self.nodes.get(parent_index) else {
                continue;
            };
            if [false, true].into_iter().any(|can_overwrite| {
                self.append_from_parent(
                    before,
                    parent_index,
                    max_logical_time_before,
                    self.nodes[added_index].logical_time,
                    can_overwrite,
                )
                .is_some_and(|produced| produced == after)
            }) {
                parents.push(parent.rowid);
            }
        }
        parents
    }

    fn append_from_parent(
        &self,
        before: &[i64],
        parent_index: usize,
        max_logical_time_before: i64,
        expected_time: i64,
        can_overwrite: bool,
    ) -> Option<Vec<i64>> {
        let parent = self.nodes.get(parent_index)?;
        let parent_lineage = *before.get(parent_index)?;
        if expected_time != parent.logical_time && expected_time != parent.logical_time + 1 {
            return None;
        }

        let mut lineage = parent_lineage;
        let logical_time = parent.logical_time;
        let mut max_lineage = *before.last()?;
        let mut next = before.to_vec();

        if logical_time != max_logical_time_before || lineage != max_lineage {
            if logical_time > 0 {
                let sacred_time = logical_time.min(max_logical_time_before);
                let sacred_lineage = self
                    .nodes
                    .iter()
                    .take(before.len())
                    .enumerate()
                    .filter(|(_, node)| node.logical_time == sacred_time)
                    .filter_map(|(index, _)| before.get(index).copied())
                    .max()?;

                if lineage < sacred_lineage {
                    let new_lineage = max_lineage + 1;
                    max_lineage = new_lineage;
                    for (index, value) in next.iter_mut().enumerate() {
                        if *value != lineage {
                            continue;
                        }
                        let node = self.nodes.get(index)?;
                        let is_ancestor = if can_overwrite {
                            node.logical_time <= logical_time
                        } else {
                            node.logical_time < logical_time
                        };
                        *value = if is_ancestor {
                            new_lineage + 1
                        } else {
                            new_lineage
                        };
                    }
                }
            }
            lineage = max_lineage + 1;
        }

        next.push(lineage);
        Some(next)
    }

    fn relaxed_search(&mut self, count: usize, lineages: Vec<i64>) -> SearchResult {
        let key = state_key(count, &lineages);
        if let Some(cached) = self.relaxed_memo.get(&key) {
            return cached.clone();
        }

        self.push_relaxed_state(count, lineages);
        self.resolve_relaxed_stack();
        self.relaxed_memo
            .get(&key)
            .cloned()
            .expect("root relaxed-search state must be resolved")
    }

    fn push_relaxed_state(&mut self, count: usize, lineages: Vec<i64>) {
        let key = state_key(count, &lineages);
        if self.relaxed_memo.contains_key(&key) {
            return;
        }

        if count == 1 {
            self.relaxed_memo.insert(
                key,
                SearchResult {
                    valid: true,
                    parents: ParentSets::new(),
                },
            );
            return;
        }

        let Some((added_rowid, added_time)) = self
            .nodes
            .get(count - 1)
            .map(|node| (node.rowid, node.logical_time))
        else {
            self.relaxed_memo.insert(key, SearchResult::default());
            return;
        };
        let before = lineages[..count - 1].to_vec();
        let Some(last_lineage) = before.last().copied() else {
            self.relaxed_memo.insert(key, SearchResult::default());
            return;
        };
        let raised: Vec<usize> = before
            .iter()
            .enumerate()
            .filter_map(|(index, lineage)| (*lineage > last_lineage).then_some(index))
            .collect();

        let mut options: Vec<(Vec<i64>, Option<i64>)> = Vec::new();
        if raised.is_empty() {
            options.push((before, None));
        } else {
            let used: HashSet<i64> = before.iter().copied().collect();
            for lineage in 0..last_lineage {
                if used.contains(&lineage) {
                    continue;
                }
                let mut restored = before.clone();
                for index in &raised {
                    restored[*index] = lineage;
                }
                options.push((restored, Some(lineage)));
            }
        }

        let mut candidates = Vec::new();
        for (predecessor, rewrite_lineage) in options {
            let parent_ids = match rewrite_lineage {
                Some(lineage) => self.rewrite_parents(&predecessor, added_time, lineage),
                None => self.highest_lineage_parents(&predecessor, added_time),
            };
            if parent_ids.is_empty() {
                continue;
            }
            candidates.push((predecessor, parent_ids));
        }

        self.relaxed_stack.push(SearchFrame {
            key,
            added_rowid,
            candidates: candidates.into_iter(),
            pending: None,
            result: SearchResult::default(),
        });
    }

    fn resolve_relaxed_stack(&mut self) {
        enum Action {
            Merge(String, Vec<i64>),
            Visit(Vec<i64>, Vec<i64>),
            Finish,
        }

        while !self.relaxed_stack.is_empty() {
            let action = {
                let frame = self.relaxed_stack.last_mut().expect("stack is not empty");
                if let Some((key, parent_ids)) = frame.pending.take() {
                    Action::Merge(key, parent_ids)
                } else if let Some((predecessor, parent_ids)) = frame.candidates.next() {
                    Action::Visit(predecessor, parent_ids)
                } else {
                    Action::Finish
                }
            };

            match action {
                Action::Merge(key, parent_ids) => {
                    let earlier = self
                        .relaxed_memo
                        .get(&key)
                        .cloned()
                        .expect("child relaxed-search state must be resolved");
                    if earlier.valid {
                        let frame = self.relaxed_stack.last_mut().expect("stack is not empty");
                        frame.result.valid = true;
                        merge_parent_sets(&mut frame.result.parents, &earlier.parents);
                        add_candidates(&mut frame.result.parents, frame.added_rowid, parent_ids);
                    }
                }
                Action::Visit(predecessor, parent_ids) => {
                    let count = predecessor.len();
                    let key = state_key(count, &predecessor);
                    self.relaxed_stack
                        .last_mut()
                        .expect("stack is not empty")
                        .pending = Some((key, parent_ids));
                    self.push_relaxed_state(count, predecessor);
                }
                Action::Finish => {
                    let frame = self.relaxed_stack.pop().expect("stack is not empty");
                    self.relaxed_memo.insert(frame.key, frame.result);
                }
            }
        }
    }

    fn highest_lineage_parents(&self, lineages: &[i64], added_time: i64) -> Vec<i64> {
        let mut parents = BTreeSet::new();
        for time in parent_times(added_time) {
            let highest = self
                .nodes
                .iter()
                .take(lineages.len())
                .enumerate()
                .filter(|(_, node)| node.logical_time == time)
                .filter_map(|(index, _)| lineages.get(index).copied())
                .max();
            let Some(highest) = highest else {
                continue;
            };
            for (index, node) in self.nodes.iter().take(lineages.len()).enumerate() {
                if node.logical_time == time && lineages[index] == highest {
                    parents.insert(node.rowid);
                }
            }
        }
        parents.into_iter().collect()
    }

    fn rewrite_parents(
        &self,
        lineages: &[i64],
        added_time: i64,
        restored_lineage: i64,
    ) -> Vec<i64> {
        let mut parents = BTreeSet::new();
        for time in parent_times(added_time) {
            for (index, node) in self.nodes.iter().take(lineages.len()).enumerate() {
                if node.logical_time == time && lineages[index] == restored_lineage {
                    parents.insert(node.rowid);
                }
            }
        }
        parents.into_iter().collect()
    }

    fn time_reduced_candidates(&self) -> SearchResult {
        let mut parents = ParentSets::new();
        for index in 1..self.nodes.len() {
            let node = &self.nodes[index];
            let prior = &self.nodes[..index];
            let mut candidates = highest_at_time(prior, node.logical_time - 1);
            if candidates.is_empty() {
                candidates = highest_at_time(prior, node.logical_time);
            }
            add_candidates(&mut parents, node.rowid, candidates);
        }
        SearchResult {
            valid: true,
            parents,
        }
    }

    fn into_graph(mut self, parents: ParentSets, fallback: Option<ParentSets>) -> HistoryGraph {
        for (index, node) in self.nodes.iter_mut().enumerate() {
            node.children.clear();
            node.parent = if index == 0 {
                Parent::None
            } else {
                let candidates = parents
                    .get(&node.rowid)
                    .or_else(|| fallback.as_ref().and_then(|sets| sets.get(&node.rowid)))
                    .cloned()
                    .unwrap_or_default();
                parent_from_ids(candidates)
            };
        }

        let mut children: HashMap<i64, Vec<i64>> = HashMap::new();
        for node in &self.nodes {
            for parent in Some(&node.parent).ids() {
                children.entry(parent).or_default().push(node.rowid);
            }
        }
        for node in &mut self.nodes {
            node.children = children.remove(&node.rowid).unwrap_or_default();
        }
        HistoryGraph::new(self.nodes)
    }
}

fn state_key(count: usize, lineages: &[i64]) -> String {
    format!("{count}:{}", lineage_key(lineages))
}

fn lineage_key(lineages: &[i64]) -> String {
    lineages
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

fn parent_times(added_time: i64) -> Vec<i64> {
    if added_time == 0 {
        vec![0]
    } else {
        vec![added_time - 1, added_time]
    }
}

fn highest_at_time(nodes: &[HistoryNode], time: i64) -> Vec<i64> {
    let Some(highest) = nodes
        .iter()
        .filter(|node| node.logical_time == time)
        .map(|node| node.lineage)
        .max()
    else {
        return Vec::new();
    };
    nodes
        .iter()
        .filter(|node| node.logical_time == time && node.lineage == highest)
        .map(|node| node.rowid)
        .collect()
}

fn parent_from_ids(ids: BTreeSet<i64>) -> Parent {
    match ids.len() {
        0 => Parent::Unknown,
        1 => Parent::Found(*ids.first().expect("one id")),
        _ => Parent::Ambiguous(ids.into_iter().collect()),
    }
}

fn merge_parent_sets(into: &mut ParentSets, from: &ParentSets) {
    for (rowid, candidates) in from {
        add_candidates(into, *rowid, candidates.iter().copied());
    }
}

fn add_candidates(into: &mut ParentSets, rowid: i64, candidates: impl IntoIterator<Item = i64>) {
    into.entry(rowid).or_default().extend(candidates);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(rowid: i64) -> HistoryNode {
        HistoryNode {
            rowid,
            lineage: rowid - 1,
            logical_time: rowid - 1,
            parent: Parent::Unknown,
            children: Vec::new(),
            tensor_name: None,
            mask_name: None,
        }
    }

    #[test]
    fn solves_a_long_linear_history_without_recursing() {
        let count = 512;
        let graph = HistorySolver::solve((1..=count).map(node).collect());

        assert_eq!(graph.get_parent(1).ids(), Vec::<i64>::new());
        assert_eq!(graph.get_parent(count).ids(), vec![count - 1]);
    }

    #[test]
    fn resolves_relaxed_candidates_with_the_work_stack() {
        let mut rewritten = node(2);
        rewritten.lineage = 5;
        let graph = HistorySolver::solve(vec![node(1), rewritten]);

        assert_eq!(graph.get_parent(2).ids(), vec![1]);
    }
}
