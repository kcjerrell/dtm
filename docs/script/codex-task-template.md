# Codex Cloud task brief template

Copy this file into the task prompt and replace every bracketed field. Remove sections that truly do not apply rather than leaving ambiguous placeholders.

## Task identity

Task ID: `[Sxx]`

Title: `[short task-oriented title]`

Base branch: `origin/scripts`

Required base SHA: `[exact SHA pushed by the orchestrator]`

Depends on: `[merged task IDs or none]`

## Required reading

Before making changes, read completely:

- `AGENTS.md`
- Any applicable nested `AGENTS.md`
- `docs/script/architecture.md`
- The task entry in `docs/script/implementation-plan.md`
- `[specific contracts/modules this task depends on]`

If the required base SHA or a required dependency is missing, stop and report the mismatch. Do not reconstruct another task's work.

## Objective

`[One concrete outcome. State what becomes possible when this task is done.]`

## In scope

- `[bounded deliverable]`
- `[bounded deliverable]`
- Regression tests for the behavior introduced by this task.

## Out of scope

- `[related work owned by another task]`
- `[future milestone]`
- Unrelated cleanup or refactoring.

## Path ownership

You may edit:

- `[exact directory or file]`
- `[exact directory or file]`
- Tests and fixtures directly associated with those paths.

Do not edit without stopping and reporting the need:

- `package.json` or a lockfile unless this task explicitly owns dependencies.
- `src/views.tsx` or `src/App.tsx` unless this is the frontend integration task.
- `src-tauri/src/lib.rs`, Tauri configuration, capabilities, Cargo manifests, or Cargo lockfile unless this task explicitly owns backend integration/tooling.
- Modules owned by another active task.

`src-tauri/src/script/mod.rs` may receive only the minimal declaration needed to compile this task. Preserve every declaration already present.

## Frozen contracts

Use these existing contracts without redefining them:

- `[type/module and key invariants]`
- `[type/module and key invariants]`

If the contract cannot support the task, report the smallest required change to the orchestrator. Do not silently fork it.

## Behavioral requirements

- `[observable behavior]`
- `[error/cancellation/lifecycle behavior]`
- `[security or persistence invariant]`

## Acceptance criteria

- `[specific externally observable criterion]`
- `[specific failure behavior]`
- `[specific compatibility or performance boundary]`
- Required tests cover both success and failure paths.

## Validation

Run the narrowest relevant commands, using repository scripts and `AGENTS.md` as authority:

- `[focused unit test]`
- `[focused type/build/check command]`
- `git diff --check`

Fresh Cloud worktrees may require generated icons or fixtures before Tauri/Rust/WDIO commands. Do not add generated artifacts to the commit unless the repository tracks them.

If a validation step cannot run in Cloud, state exactly why and identify the local/orchestrator gate that remains. Do not weaken tests or implementation to make an environmental failure disappear.

## Handoff format

Return:

1. Commit SHA or ordered commit SHAs.
2. Concise summary of the implemented behavior.
3. Changed files grouped by purpose.
4. Validation commands and their results.
5. Tests or platform checks not run.
6. Any contract change, merge-order requirement, or follow-up discovered.
7. Confirmation that no out-of-scope files were changed, or an explanation for each exception.

Do not merge the task branch. The orchestrator will review and merge it.
