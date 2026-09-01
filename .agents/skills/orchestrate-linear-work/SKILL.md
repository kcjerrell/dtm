---
name: orchestrate-linear-work
description: Execute a planned Linear development effort by creating a task branch, delegating ready sub-issues to Codex subagents, reviewing completed work, propagating relevant context, and producing a stacked pull-request series. Use after a parent Linear issue has already been decomposed into executable sub-issues.
---

# Orchestrate Linear work

Execute an existing Linear work plan through Codex subagents. Coordinate the work, preserve dependency order, review results as they arrive, and produce a coherent stacked pull-request series.

This skill orchestrates implementation. **Do not redesign the work plan unless execution reveals that the existing plan is materially incorrect or impossible. Do not perform substantial implementation in the orchestrator when the work can reasonably be delegated to a subagent.**

## Establish the execution context

1. Read the parent Linear issue and all sub-issues.
2. Inspect their dependency relationships, acceptance criteria, and relevant repository context.
3. Confirm the current repository state and identify the branch from which the work should be based.
4. Create a dedicated branch for the overall task before delegating implementation.
5. Determine which sub-issues are currently unblocked and which can safely proceed in parallel.

Use the Linear dependency graph as the primary execution order. Do not serialize independent work unnecessarily.

If the Linear plan is incomplete in a way that prevents safe execution, make the smallest necessary correction or report the planning gap rather than silently inventing a different project structure.

## Branch and stack strategy

Treat the parent task branch as the base of the implementation stack.

For each delegated subtask:

- Create or assign a dedicated branch for that subtask.
- Base the branch on the latest branch containing all prerequisite work for that subtask.
- Keep each branch limited to the scope of its Linear issue.
- Preserve a clean ancestry so completed subtasks can form a reviewable PR stack.
- Avoid unrelated cleanup or refactoring unless required by the assigned issue.

When a subtask depends on another subtask, its branch should be based on the completed prerequisite branch rather than independently branching from the original task base.

Independent subtasks may be developed concurrently. When they later need to converge, integrate them deliberately into the stack before beginning work that depends on the combined result.

## Delegate subtasks

For every ready sub-issue that should be implemented independently, spawn a Codex subagent.

Instruct each subagent to use the repository's **subtask execution skill** and provide it with:

- The Linear issue identifier and link.
- The issue description and acceptance criteria.
- The branch it should work on.
- Relevant architectural or repository context not already present in the issue.
- Known prerequisite work already completed.
- Relevant findings from previously completed subtasks.
- Constraints or decisions that must remain consistent across the overall effort.

Give the subagent only the context it needs to complete its assigned issue. Do not copy the entire orchestration conversation when a concise task-specific summary is sufficient.

Each subagent owns only its assigned issue. It should not expand the project scope, restructure the remaining plan, or perform work assigned to another sub-issue.

## Manage concurrency

Spawn multiple subagents when their issues are genuinely independent and their branches are unlikely to conflict materially.

Do not maximize concurrency merely because tasks can technically start at the same time. Account for:

- overlapping files or modules,
- shared APIs or data structures,
- architectural decisions likely to affect later work,
- merge and integration cost,
- whether one task is likely to produce useful information for another.

Prefer a smaller number of useful parallel workstreams over excessive delegation that increases coordination and integration overhead.

## Review each completed subtask

As each subagent completes, perform a **brief orchestration review** before considering newly unblocked work.

This is not a full code review. Its purpose is to determine whether the result is suitable to become part of the execution stack and whether it changes the context for subsequent tasks.

Check:

1. The work appears to match the assigned Linear issue.
2. The reported validation was performed and there are no obvious failures.
3. The branch contains only reasonably related changes.
4. No architectural decision or discovered constraint conflicts with the remaining plan.
5. The result is in a state that downstream work can safely build upon.

If a small correction is needed, return the task to the same subagent when practical rather than implementing the correction in the orchestrator.

If the work reveals a significant planning problem, dependency change, or unexpected constraint, update the relevant Linear issues before continuing.

## Propagate findings forward

After reviewing a completed subtask, extract only information that matters to remaining work.

Examples include:

- APIs or interfaces that were introduced or changed.
- File or module locations that differ from the original plan.
- Architectural decisions made during implementation.
- Test or build behavior discovered during the task.
- Compatibility constraints.
- Known limitations or follow-up work.
- Changes to the expected dependency order.

Pass these findings to subsequently spawned subagents when they affect their assignments.

Do not burden later agents with full transcripts or irrelevant implementation details. Propagate concise state, decisions, and constraints.

## Advance the dependency graph

After every completion:

1. Mark or update the corresponding Linear issue as appropriate.
2. Re-evaluate which remaining issues are now unblocked.
3. Determine the correct branch base for each newly ready issue.
4. Pass relevant findings from completed prerequisite work.
5. Spawn the next appropriate subagents.

Continue until all implementation sub-issues required by the parent are complete.

## Integrate the stack

Once all required subtasks are complete:

1. Verify that the branch ancestry reflects the intended dependency order.
2. Resolve any integration conflicts between parallel workstreams.
3. Run the parent issue's project-level validation.
4. Confirm that all parent acceptance criteria are covered by the completed sub-issues.
5. Ensure no temporary debugging changes, unrelated edits, or abandoned implementation paths remain.
6. Update Linear with any final implementation or validation notes.

The orchestrator may perform small integration-only edits when necessary to combine otherwise completed work. Substantial missing implementation should be delegated back to an appropriate subtask agent instead.

## Produce stacked pull requests

Create a stacked PR series representing the completed work.

Each PR should:

- Correspond to a coherent subtask or integration step.
- Target the immediately preceding branch in the stack rather than the repository's main branch when it depends on earlier work.
- Have a concise title tied to the relevant Linear issue.
- Explain the purpose of the change, notable implementation details, and validation performed.
- Reference the relevant Linear issue.
- Avoid duplicating descriptions of work contained in lower PRs in the stack.

The bottom PR in the stack should target the original destination branch. Each subsequent PR should target the branch represented by the PR directly below it.

The resulting stack should make it possible to review the work incrementally while preserving the dependency structure used during implementation.

If independent branches were developed in parallel, arrange or integrate them into a deterministic final stack before opening the PRs.

## Final review

Before reporting completion, verify:

1. Every required Linear sub-issue has corresponding completed work.
2. All genuine dependencies were respected.
3. Relevant discoveries were propagated to downstream tasks.
4. Each subtask received a brief orchestration review.
5. The full integrated result passes the parent-level validation.
6. The PR stack has correct base branches and ordering.
7. Each PR is reasonably sized and independently reviewable.
8. Linear accurately reflects the final execution state.

Return a compact summary containing:

- The parent Linear issue.
- The completed sub-issues.
- The PR stack in review order.
- Validation performed.
- Important implementation findings or deviations from the original plan.
- Any unresolved risks or follow-up work.
