---
name: plan-linear-work
description: Inspect a repository and turn a requested development effort into one Linear parent issue with self-contained sub-issues, dependencies, and validation criteria. Use for planning and organizing work in Linear; do not use to implement or delegate the work.
---

# Plan work in Linear

Turn a development request into a durable, executable Linear work plan. The result must let a fresh engineer or coding agent pick up any unblocked sub-issue without needing this planning conversation.

This skill plans and organizes only. **Never implement code, edit product files, run migrations, create branches or pull requests, or delegate execution.**

## Before creating issues

1. Restate the requested outcome, constraints, and success conditions. Ask one focused question only if a material product or technical decision cannot be discovered from the repository or ticket context.
2. Inspect the repository before designing the plan. Read relevant source, configuration, documentation, tests, CI, build tooling, and recent history when it clarifies intent. Use targeted searches; do not modify repository files.
3. Identify the current behavior, likely change surfaces, risks, and the smallest meaningful units of work. Separate tasks only when they can be implemented or reviewed independently; do not split solely by file or layer.
4. Confirm that a Linear integration and a destination team/project are available. If either is unavailable, provide the complete proposed issue set in chat instead of attempting partial external changes.

## Design the issue hierarchy

Create exactly one parent issue that describes the outcome and owns the work. Create separate sub-issues for the executable units needed to deliver it.

The parent issue must include:

- A concise outcome-oriented title.
- Context: the problem, current state, and why the work matters.
- Scope and explicit non-goals.
- A brief implementation approach that synthesizes the repository findings.
- A checklist or linked list of the sub-issues.
- Overall acceptance criteria and any rollout, compatibility, or operational considerations that apply to the whole effort.

Each sub-issue must be self-contained and include:

- A verb-led, outcome-oriented title.
- Context sufficient to understand why it exists and how it fits the parent.
- Scope: concrete responsibilities, likely files/components or systems to inspect, and notable constraints.
- Explicit non-goals when they prevent scope creep.
- Implementation notes that guide the work without pretending to have made the changes.
- Validation criteria: observable checks, relevant test commands or manual verification, and acceptance criteria appropriate to the task.
- Dependencies or prerequisites, including exact issue identifiers once created.

Avoid vague work items such as “update backend” or “add tests.” A test task is separate only when it is a meaningful independently reviewable deliverable; in other cases, put validation requirements in the implementation task.

## Dependencies and ordering

Model execution order explicitly with Linear’s blocking/dependency relationship when it is supported. Use the relationship direction carefully: an issue that cannot begin or finish until another issue is complete is **blocked by** that prerequisite. Do not use hierarchy as a substitute for dependencies.

- Mark only real dependencies; do not serialize work that can proceed in parallel.
- Use the parent/sub-issue relationship for ownership and planning structure.
- Record any external prerequisite (access, service, decision, vendor, or environment) in the affected issue and in the parent’s risks if it affects the plan broadly.
- If relationships cannot be created through the available Linear integration, state the intended blockers plainly in each issue body and report that gap.

## Create and review

Create the parent, then create its sub-issues, then apply the explicit dependencies. Populate returned issue identifiers and links in the parent and sub-issues where useful.

Before reporting completion, perform a decomposition review:

1. Every requirement from the request has an owner.
2. Every sub-issue is understandable without this conversation.
3. Scope boundaries and validation criteria are present for every sub-issue.
4. Dependencies accurately reflect what must happen first and permit parallel work where possible.
5. There is no duplicated, missing, or artificially tiny work item.
6. The parent describes the integrated outcome rather than repeating all task details.

Fix deficiencies you find in the created issues, then return a compact summary: the parent issue, sub-issues with their blockers, notable assumptions, and any external prerequisites or integration limitations.

## Handling uncertainty

When the repository evidence does not support a confident decomposition, create an explicit discovery/spike sub-issue only if resolving that uncertainty is a real prerequisite. Define its question, time/scope boundary, expected evidence, and the decision it must unlock. Do not hide uncertainty behind invented details.

## Task granularity

Account for the fixed overhead of each sub-issue: a separate agent or engineer may need to acquire context, inspect the relevant code, implement the change, validate it, report the result, and have the work reviewed and integrated. Do not create a sub-issue unless the separation provides enough value to justify that overhead.

Prefer sub-issues that represent a **manageable, independently reviewable unit of meaningful work**. A good sub-issue should usually produce a coherent result rather than merely completing one mechanical step toward a result.

Group related work into the same sub-issue when:

- The individual changes are small and share substantially the same implementation context.
- Separating them would require multiple workers to independently inspect and understand the same code.
- The pieces are unlikely to be useful, testable, or reviewable independently.
- The combined work remains reasonably scoped and can be validated as a coherent unit.
- Integration overhead would be disproportionate to the size or complexity of the individual pieces.

Split work when the resulting units have meaningful independence: they can proceed in parallel, have substantially different implementation contexts, carry distinct risks, require different expertise, or are independently useful and reviewable.

Do not optimize for the maximum possible number of parallel tasks. Optimize for the smallest number of well-scoped tasks that still exposes **useful parallelism** and keeps each task manageable.

Avoid sub-issues that amount to trivial edits such as changing a single configuration value, adding one small helper, updating one call site, or making a minor documentation adjustment when those changes naturally belong to a larger implementation task. Include such work in the relevant sub-issue's scope and acceptance criteria instead.

As a final granularity check, ask of every proposed sub-issue:

1. Is there enough meaningful work here to justify a separate context acquisition, implementation, validation, and review cycle?
2. Would combining it with an adjacent task make that task substantially harder to understand, execute, or review?
3. Does separating it enable useful parallelism or establish a meaningful dependency boundary?

If the first answer is no and the other answers are also no, combine the work with the most closely related sub-issue.
