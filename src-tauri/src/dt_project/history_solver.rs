//! Fast, bounded reconstruction of Draw Things history parents.
//!
//! `pushHistory` can erase the only persisted evidence of a node's old
//! lineage.  An exhaustive solver therefore has to branch while walking the
//! table backwards.  The important bound used here is that a rewritten
//! lineage is vacant after the rewrite: all rows on that lineage were moved to
//! the two newly allocated lineages.  Consequently, only vacant lineages are
//! predecessor candidates; trying every lineage from zero to `maxLineage` is
//! both unnecessary and the source of the exponential behaviour in the exact
//! solver.
//!
//! Vacant lineages can still be ambiguous.  This implementation keeps the
//! best few reverse states instead of enumerating all of them.  It is therefore
//! deliberately an approximation: it may retain an extra candidate, and an
//! unusually ambiguous history can lose a candidate when the beam is pruned.

use std::collections::{BTreeSet, HashMap, HashSet};

use crate::dt_project::{HistoryGraph, HistoryNode, Parent, ParentExt};

type ParentSets = HashMap<i64, BTreeSet<i64>>;

/// A small beam is enough for the observed histories and puts a hard bound on
/// work for histories containing thousands of rows.
const DEFAULT_BEAM_WIDTH: usize = 8;

#[derive(Clone, Debug, Eq, PartialEq)]
struct ReverseState {
    /// Lineages visible immediately after the last row in this state was added.
    lineages: Vec<i64>,
    /// Lower is better. Penalties are compatibility hints, not correctness
    /// claims, because deleted rows and older DT versions violate some rules.
    penalty: u32,
}

struct StepOption {
    state: ReverseState,
    parents: Vec<i64>,
}

pub struct HistorySolver;

impl HistorySolver {
    /// Solve and cache the complete graph using bounded reverse reconstruction.
    ///
    /// Runtime is `O(beam_width * n^2)` in the worst case and memory is
    /// `O(beam_width * n)`. Unlike the exact solver, runtime is not exponential
    /// in the number of rewritten lineages.
    pub fn solve(mut nodes: Vec<HistoryNode>) -> HistoryGraph {
        nodes.sort_by_key(|node| node.rowid);
        if nodes.is_empty() {
            return HistoryGraph::new(nodes);
        }

        let mut solver = Solver::new(nodes, DEFAULT_BEAM_WIDTH);
        let mut parents = solver.solve_parent_sets();
        solver.apply_conclusive_final_continuations(&mut parents);
        solver.into_graph(parents)
    }

    /// Answer one UI lookup without solving parents for every earlier row.
    ///
    /// Rows newer than `rowid` still have to be unwound because they may have
    /// rewritten its lineage. For a recently selected image this is close to
    /// linear instead of solving the whole graph and then discarding it.
    pub fn parent(mut nodes: Vec<HistoryNode>, rowid: i64) -> Parent {
        nodes.sort_by_key(|node| node.rowid);
        let Some(target) = nodes.iter().position(|node| node.rowid == rowid) else {
            return Parent::Unknown;
        };
        if target == 0 {
            return Parent::None;
        }

        Solver::new(nodes, DEFAULT_BEAM_WIDTH).parent_at(target)
    }
}

struct Solver {
    nodes: Vec<HistoryNode>,
    beam_width: usize,
}

impl Solver {
    fn new(nodes: Vec<HistoryNode>, beam_width: usize) -> Self {
        Self {
            nodes,
            beam_width: beam_width.max(1),
        }
    }

    fn initial_state(&self) -> ReverseState {
        ReverseState {
            lineages: self.nodes.iter().map(|node| node.lineage).collect(),
            penalty: 0,
        }
    }

    fn solve_parent_sets(&mut self) -> ParentSets {
        let mut result = ParentSets::new();
        let mut beam = vec![self.initial_state()];

        for added_index in (1..self.nodes.len()).rev() {
            let mut next = Vec::new();
            for state in &beam {
                for option in self.step_options(state, added_index) {
                    add_candidates(&mut result, self.nodes[added_index].rowid, option.parents);
                    next.push(option.state);
                }
            }
            beam = prune(next, self.beam_width);
            if beam.is_empty() {
                break;
            }
        }

        // Corrupt/deleted histories should degrade to a useful answer rather
        // than returning Unknown for an entire prefix.
        for index in 1..self.nodes.len() {
            if result
                .get(&self.nodes[index].rowid)
                .is_none_or(BTreeSet::is_empty)
            {
                add_candidates(
                    &mut result,
                    self.nodes[index].rowid,
                    self.fallback_parents(index),
                );
            }
        }
        result
    }

    fn parent_at(&self, target: usize) -> Parent {
        if let Some(parent) = self.final_continuation_parent(target) {
            return Parent::Found(parent);
        }

        let mut beam = vec![self.initial_state()];

        // Only unwind mutations which happened after the requested node.
        for added_index in ((target + 1)..self.nodes.len()).rev() {
            let next = beam
                .iter()
                .flat_map(|state| self.step_options(state, added_index))
                .map(|option| option.state)
                .collect();
            beam = prune(next, self.beam_width);
            if beam.is_empty() {
                break;
            }
        }

        let mut candidates = BTreeSet::new();
        for state in &beam {
            for option in self.step_options(state, target) {
                candidates.extend(option.parents);
            }
        }

        if candidates.is_empty() {
            candidates.extend(self.fallback_parents(target));
        }

        parent_from_ids(candidates)
    }

    fn step_options(&self, state: &ReverseState, added_index: usize) -> Vec<StepOption> {
        if added_index == 0 || state.lineages.len() <= added_index {
            return Vec::new();
        }

        let before_len = added_index;
        let last_lineage = state.lineages[before_len - 1];
        let added_lineage = state.lineages[added_index];
        let raised: Vec<usize> = state.lineages[..before_len]
            .iter()
            .enumerate()
            .filter_map(|(index, lineage)| (*lineage > last_lineage).then_some(index))
            .collect();

        if raised.is_empty() {
            let mut next = state.lineages[..before_len].to_vec();
            next.shrink_to_fit();
            let delta = added_lineage - last_lineage;
            let parents = if delta == 0 {
                self.direct_continuation_parent(&state.lineages, before_len, added_index)
                    .map(|parent| vec![parent])
                    .unwrap_or_else(|| {
                        self.highest_lineage_parents(&state.lineages, before_len, added_index)
                    })
            } else {
                self.highest_lineage_parents(&state.lineages, before_len, added_index)
            };
            return vec![StepOption {
                parents,
                state: ReverseState {
                    lineages: next,
                    penalty: state.penalty + u32::from(!matches!(delta, 0 | 1)) * 16,
                },
            }];
        }

        // A rewrite removes the predecessor lineage from every persisted row.
        // Only holes below the previous maximum can therefore be restored.
        let used: HashSet<i64> = state.lineages[..before_len]
            .iter()
            .copied()
            .filter(|lineage| *lineage <= last_lineage)
            .collect();
        let mut vacant: Vec<i64> = (0..last_lineage)
            .filter(|lineage| !used.contains(lineage))
            .collect();

        let mut invalid_penalty = 0;
        if vacant.is_empty() {
            // Keep one relaxed route for tables changed by deletion or an old
            // writer. This collision is heavily penalized and cannot branch.
            vacant.push(last_lineage.saturating_sub(1));
            invalid_penalty = 32;
        }

        let shape_penalty =
            self.rewrite_shape_penalty(state, added_index, last_lineage, added_lineage, &raised);
        let raised_parents = self.rewrite_parents(&state.lineages, added_index, &raised);

        vacant
            .into_iter()
            .map(|old_lineage| {
                let mut parents = raised_parents.clone();
                // DT can retain the selected lineage-0 leaf as the persisted
                // parent while borrowing a same-time fork's effective lineage.
                if old_lineage == 1 {
                    parents.extend(self.lineage_zero_fork_anchors(
                        &state.lineages,
                        before_len,
                        added_index,
                    ));
                    parents.sort_unstable();
                    parents.dedup();
                }
                if parents.is_empty() {
                    parents =
                        self.highest_lineage_parents(&state.lineages, before_len, added_index);
                }

                let mut restored = state.lineages[..before_len].to_vec();
                for index in &raised {
                    restored[*index] = old_lineage;
                }
                restored.shrink_to_fit();

                StepOption {
                    parents,
                    state: ReverseState {
                        lineages: restored,
                        penalty: state.penalty + shape_penalty + invalid_penalty,
                    },
                }
            })
            .collect()
    }

    /// A continuation is conclusive when the reconstructed predecessor state
    /// contains the same lineage at exactly T-1. TensorHistoryNode's composite
    /// key makes this row unique.
    fn direct_continuation_parent(
        &self,
        lineages: &[i64],
        before_len: usize,
        added_index: usize,
    ) -> Option<i64> {
        let added_lineage = lineages[added_index];
        let parent_time = self.nodes[added_index].logical_time - 1;
        self.nodes[..before_len]
            .iter()
            .enumerate()
            .find(|(index, node)| {
                node.logical_time == parent_time && lineages[*index] == added_lineage
            })
            .map(|(_, node)| node.rowid)
    }

    fn rewrite_shape_penalty(
        &self,
        state: &ReverseState,
        added_index: usize,
        last_lineage: i64,
        added_lineage: i64,
        raised: &[usize],
    ) -> u32 {
        let mut penalty = u32::from(added_lineage != last_lineage + 2) * 16;
        let expected_lower = last_lineage + 1;
        let expected_upper = last_lineage + 2;
        penalty += raised
            .iter()
            .filter(|index| {
                !matches!(state.lineages[**index], value if value == expected_lower || value == expected_upper)
            })
            .count() as u32
            * 4;

        // Choose the best of normal/same-time pushes and both canOverwrite
        // values. The columns do not retain which variant was used.
        let added_time = self.nodes[added_index].logical_time;
        let best_threshold_mismatches = parent_times(added_time)
            .into_iter()
            .flat_map(|parent_time| {
                [false, true].into_iter().map(move |can_overwrite| {
                    raised
                        .iter()
                        .filter(|index| {
                            let node = &self.nodes[**index];
                            let ancestor = if can_overwrite {
                                node.logical_time <= parent_time
                            } else {
                                node.logical_time < parent_time
                            };
                            let expected = if ancestor {
                                expected_upper
                            } else {
                                expected_lower
                            };
                            state.lineages[**index] != expected
                        })
                        .count() as u32
                })
            })
            .min()
            .unwrap_or(0);
        penalty + best_threshold_mismatches
    }

    fn rewrite_parents(&self, _lineages: &[i64], added_index: usize, raised: &[usize]) -> Vec<i64> {
        let added_time = self.nodes[added_index].logical_time;
        let at_time = |time| {
            raised
                .iter()
                .filter_map(|index| {
                    let node = &self.nodes[*index];
                    (node.logical_time == time).then_some(node.rowid)
                })
                .collect::<Vec<_>>()
        };
        let ordinary = at_time(added_time - 1);
        if ordinary.is_empty() {
            at_time(added_time)
        } else {
            ordinary
        }
    }

    fn highest_lineage_parents(
        &self,
        lineages: &[i64],
        before_len: usize,
        added_index: usize,
    ) -> Vec<i64> {
        let at_time = |time| {
            let mut parents = BTreeSet::new();
            let highest = self.nodes[..before_len]
                .iter()
                .enumerate()
                .filter(|(_, node)| node.logical_time == time)
                .map(|(index, _)| lineages[index])
                .max();
            if let Some(highest) = highest {
                parents.extend(
                    self.nodes[..before_len]
                        .iter()
                        .enumerate()
                        .filter(|(index, node)| {
                            node.logical_time == time && lineages[*index] == highest
                        })
                        .map(|(_, node)| node.rowid),
                );
            }
            parents.into_iter().collect::<Vec<_>>()
        };
        let added_time = self.nodes[added_index].logical_time;
        let ordinary = at_time(added_time - 1);
        if ordinary.is_empty() {
            at_time(added_time)
        } else {
            ordinary
        }
    }

    fn lineage_zero_fork_anchors(
        &self,
        lineages: &[i64],
        before_len: usize,
        added_index: usize,
    ) -> Vec<i64> {
        let at_time = |time| {
            self.nodes[..before_len]
                .iter()
                .enumerate()
                .filter(|(index, node)| node.logical_time == time && lineages[*index] == 0)
                .map(|(_, node)| node.rowid)
                .max()
        };
        let added_time = self.nodes[added_index].logical_time;
        if let Some(ordinary) = at_time(added_time - 1) {
            vec![ordinary]
        } else {
            at_time(added_time).into_iter().collect()
        }
    }

    fn fallback_parents(&self, index: usize) -> Vec<i64> {
        let prior = &self.nodes[..index];
        let time = self.nodes[index].logical_time;
        let mut parents = highest_final_at_time(prior, time - 1);
        if parents.is_empty() {
            parents = highest_final_at_time(prior, time);
        }
        parents
    }

    /// A persisted same-lineage row at exactly T-1 is a conclusive
    /// continuation. Reverse reconstruction may temporarily restore that row
    /// to an older lineage along another beam path, but those speculative
    /// states must not weaken this directly observable edge.
    fn final_continuation_parent(&self, index: usize) -> Option<i64> {
        let node = self.nodes.get(index)?;
        self.nodes[..index]
            .iter()
            .find(|candidate| {
                candidate.lineage == node.lineage && candidate.logical_time == node.logical_time - 1
            })
            .map(|candidate| candidate.rowid)
    }

    fn apply_conclusive_final_continuations(&self, parents: &mut ParentSets) {
        for index in 1..self.nodes.len() {
            if let Some(parent) = self.final_continuation_parent(index) {
                parents.insert(self.nodes[index].rowid, BTreeSet::from([parent]));
            }
        }
    }

    fn into_graph(mut self, parents: ParentSets) -> HistoryGraph {
        for (index, node) in self.nodes.iter_mut().enumerate() {
            node.children.clear();
            node.parent = if index == 0 {
                Parent::None
            } else {
                parent_from_ids(parents.get(&node.rowid).cloned().unwrap_or_default())
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

fn prune(mut states: Vec<ReverseState>, width: usize) -> Vec<ReverseState> {
    states.sort_unstable_by(|left, right| {
        left.penalty
            .cmp(&right.penalty)
            .then_with(|| left.lineages.cmp(&right.lineages))
    });
    states.dedup_by(|left, right| left.lineages == right.lineages);
    states.truncate(width);
    states
}

fn parent_times(added_time: i64) -> Vec<i64> {
    if added_time == 0 {
        vec![0]
    } else {
        vec![added_time - 1, added_time]
    }
}

fn highest_final_at_time(nodes: &[HistoryNode], time: i64) -> Vec<i64> {
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

fn add_candidates(into: &mut ParentSets, rowid: i64, candidates: impl IntoIterator<Item = i64>) {
    into.entry(rowid).or_default().extend(candidates);
}

fn parent_from_ids(ids: BTreeSet<i64>) -> Parent {
    match ids.len() {
        0 => Parent::Unknown,
        1 => Parent::Found(*ids.first().expect("one parent")),
        _ => Parent::Ambiguous(ids.into_iter().collect()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(rowid: i64, lineage: i64, logical_time: i64) -> HistoryNode {
        HistoryNode {
            rowid,
            lineage,
            logical_time,
            parent: Parent::Unknown,
            children: Vec::new(),
            tensor_name: None,
            mask_name: None,
        }
    }

    #[test]
    fn solves_a_long_linear_history_with_bounded_state() {
        let count = 1_024;
        let nodes = (1..=count).map(|rowid| node(rowid, 0, rowid - 1)).collect();
        let graph = HistorySolver::solve(nodes);

        assert_eq!(graph.get_parent(1).ids(), Vec::<i64>::new());
        assert_eq!(graph.get_parent(count).ids(), vec![count - 1]);
    }

    #[test]
    fn only_vacant_lineages_are_restored() {
        // Snapshot immediately after lin7 node 14. Lineage 1 was rewritten to
        // 5/6 and is the only vacant lineage below the prior maximum (4).
        let mut nodes: Vec<_> = (1..=9).map(|id| node(id, 0, id)).collect();
        nodes.extend([
            node(10, 5, 9),
            node(11, 2, 9),
            node(12, 3, 9),
            node(13, 4, 9),
            node(14, 6, 10),
        ]);
        let solver = Solver::new(nodes, DEFAULT_BEAM_WIDTH);
        let options = solver.step_options(&solver.initial_state(), 13);

        assert_eq!(options.len(), 1);
        assert_eq!(options[0].state.lineages[9], 1);
    }

    #[test]
    fn includes_the_same_time_fork_anchor() {
        let mut nodes: Vec<_> = (1..=9).map(|id| node(id, 0, id)).collect();
        nodes.extend([
            node(10, 5, 9),
            node(11, 2, 9),
            node(12, 3, 9),
            node(13, 4, 9),
            node(14, 6, 10),
        ]);

        let parent = HistorySolver::parent(nodes, 14);
        assert_eq!(Some(&parent).ids(), vec![9, 10]);
    }

    #[test]
    fn target_only_lookup_does_not_need_to_solve_the_prefix() {
        let count = 10_000;
        let nodes = (1..=count).map(|rowid| node(rowid, 0, rowid - 1)).collect();

        let parent = HistorySolver::parent(nodes, count);
        assert_eq!(Some(&parent).ids(), vec![count - 1]);
    }

    #[test]
    fn direct_continuation_takes_precedence_over_a_forwarded_anchor() {
        let mut nodes: Vec<_> = (1..=8).map(|id| node(id, 8, id)).collect();
        nodes.extend([
            node(9, 7, 9),
            node(10, 5, 9),
            node(11, 2, 9),
            node(12, 10, 9),
            node(13, 4, 9),
            node(14, 6, 10),
            node(15, 8, 10),
            node(16, 9, 10),
            node(17, 11, 10),
            node(18, 11, 11),
        ]);

        let graph = HistorySolver::solve(nodes);
        assert_eq!(graph.get_parent(18).ids(), vec![17]);
    }

    #[test]
    fn same_lineage_continuation_has_only_its_immediate_parent() {
        let mut nodes: Vec<_> = (1..=8).map(|id| node(id, 16, id)).collect();
        nodes.extend([
            node(9, 7, 9),
            node(10, 5, 9),
            node(11, 2, 9),
            node(12, 10, 9),
            node(13, 4, 9),
            node(14, 12, 10),
            node(15, 15, 10),
            node(16, 9, 10),
            node(17, 11, 10),
            node(18, 11, 11),
            node(19, 13, 11),
            node(20, 14, 9),
            node(21, 14, 10),
            node(22, 14, 11),
            node(23, 14, 12),
            node(24, 14, 13),
            node(25, 16, 11),
        ]);

        let direct = HistorySolver::parent(nodes.clone(), 24);
        assert_eq!(Some(&direct).ids(), vec![23]);

        let graph = HistorySolver::solve(nodes);
        assert_eq!(graph.get_parent(21).ids(), vec![20]);
        assert_eq!(graph.get_parent(22).ids(), vec![21]);
        assert_eq!(graph.get_parent(23).ids(), vec![22]);
        assert_eq!(graph.get_parent(24).ids(), vec![23]);
    }

    #[test]
    fn ordinary_parent_time_excludes_same_time_candidates() {
        let graph = HistorySolver::solve(vec![
            node(1, 0, 0),
            node(2, 0, 1),
            node(3, 1, 2),
            node(4, 2, 2),
        ]);

        assert_eq!(graph.get_parent(4).ids(), vec![2]);
    }

    #[test]
    fn same_time_parent_is_used_only_as_a_fallback() {
        let graph = HistorySolver::solve(vec![node(1, 0, 0), node(2, 1, 0)]);

        assert_eq!(graph.get_parent(2).ids(), vec![1]);
    }
}
