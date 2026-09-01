---
name: execute-linear-subtask
description: Implement one assigned Linear sub-issue on its designated branch, keeping strictly to scope, validating the result, and reporting concise implementation details back to the orchestrator. Use only for execution of a single delegated subtask.
---

# Execute one Linear subtask

Implement exactly one assigned Linear sub-issue.

This skill is for focused execution by a worker agent. **Do not re-plan the parent effort, delegate additional agents, create unrelated work, or expand scope beyond what is required to complete the assigned issue.**

The assigned Linear issue is the primary source of truth for scope, constraints, dependencies, and acceptance criteria. Additional instructions from the orchestrator may provide implementation context or findings from prerequisite work.

## Establish task context

Before modifying code:

1. Read the assigned Linear issue completely.
2. Read any prerequisite issues, orchestrator notes, or implementation findings provided with the assignment.
3. Confirm that the current branch is the branch assigned for this subtask and that prerequisite work expected by the issue is present.
4. Inspect the relevant repository code, tests, configuration, documentation, and nearby implementation patterns necessary to understand the task.
5. Identify the smallest coherent implementation that satisfies the issue's acceptance criteria.

Do not perform a broad repository investigation when targeted inspection is sufficient.

If the repository state materially contradicts the issue or the task cannot safely proceed because a prerequisite is missing, report the blocker to the orchestrator rather than silently inventing a workaround.

## Stay within scope

Implement the complete assigned issue, but no more.

You may make supporting changes outside the initially expected files when they are genuinely required for correctness, compatibility, testing, or integration. Keep those changes directly tied to the assigned outcome.

Avoid:

- unrelated refactoring,
- opportunistic cleanup,
- formatting unrelated files,
- dependency upgrades not required by the task,
- redesigning APIs outside the assigned scope,
- implementing work owned by another Linear issue,
- speculative future-proofing.

If you discover additional work that should be done but is not necessary to satisfy this issue, report it rather than implementing it.

Do not split small supporting changes into separate work. If a helper, test update, configuration adjustment, documentation change, or minor migration is naturally part of the assigned task, include it here.

## Respect prior decisions

Treat completed prerequisite work and orchestrator-provided findings as established context unless repository evidence shows that they are incorrect.

Maintain compatibility with interfaces, architectural decisions, naming, and constraints introduced by prerequisite tasks.

If completing this issue would require reversing or materially changing a prior decision, stop and report the conflict to the orchestrator before proceeding with that change.

## Implement coherently

Prefer repository-native patterns and existing abstractions over introducing new mechanisms.

When choosing among reasonable implementations:

1. Follow existing conventions in the affected code.
2. Minimize unnecessary surface-area changes.
3. Keep the implementation understandable to a reviewer without requiring this agent's reasoning history.
4. Preserve backwards compatibility when required by the issue or surrounding system.
5. Add or update validation alongside the implementation when appropriate.

Do not optimize for minimizing line count at the expense of clarity or correctness.

## Validate the result

Run the most relevant validation available for the assigned task.

Use the issue's validation criteria when provided. Depending on the task, validation may include:

- targeted unit or integration tests,
- type checking,
- linting or formatting checks,
- compilation or build checks,
- focused end-to-end tests,
- manual verification of observable behavior.

Prefer targeted validation during implementation. Run broader checks when the issue requires them or when the change has enough reach to justify them.

Do not claim validation that was not actually performed.

If a validation step cannot be run because of environment limitations, missing services, unavailable credentials, platform constraints, or unrelated repository failures, state that clearly and distinguish it from failures caused by your changes.

## Inspect your own changes

Before finishing:

1. Review the diff for the assigned branch.
2. Remove debugging code, temporary instrumentation, accidental formatting changes, and unrelated edits.
3. Confirm that every changed file is reasonably attributable to the assigned issue.
4. Re-check the issue's acceptance criteria against the implemented behavior.
5. Confirm that known prerequisite interfaces or constraints were preserved.
6. Check for obvious incomplete paths, TODOs introduced by the task, or error handling gaps.
7. Ensure relevant validation has passed or that any limitations are documented.

Fix issues found during this review before reporting completion.

## Handle unexpected discoveries

Implementation may reveal information relevant to later subtasks.

Examples include:

- an expected API behaves differently than the plan assumed,
- an interface had to change,
- a file or subsystem responsible for the behavior differs from the issue description,
- a new compatibility constraint was discovered,
- a test exposes behavior downstream tasks must account for,
- a dependency assumption is incorrect.

Do not broaden the current task merely because such information is discovered.

Instead, complete the assigned issue when it remains safe to do so and include a concise **Findings for downstream work** section in the completion report.

If the discovery prevents correct completion or materially changes the planned architecture, stop at a safe state and report the blocker.

## Do not manage orchestration

The worker does not own the wider execution graph.

Do not:

- spawn subagents,
- start another Linear issue,
- modify dependencies between unrelated issues,
- decide which task should execute next,
- create or reorganize the final PR stack,
- merge other workers' branches,
- perform project-wide integration work unless explicitly part of this issue.

Return control to the orchestrator after this task is complete.

## Completion report

When finished, return a concise report containing:

### Result

State whether the Linear issue is complete, blocked, or partially complete.

### Changes

Summarize the implemented behavior and list the important files or components changed. Describe outcomes rather than narrating every edit.

### Validation

List the commands or checks actually performed and their results.

### Findings for downstream work

Include only information that may affect later subtasks or integration. Omit this section when there is nothing material to propagate.

### Remaining concerns

List unresolved risks, environment limitations, follow-up work, or acceptance criteria that could not be verified. If none remain, say so briefly.

The report should give the orchestrator enough information to perform a brief review and safely decide what work can start next without requiring it to reconstruct this agent's full implementation process.
