# Image scripting implementation plan

Status: ready for task creation

Target branch: `origin/scripts`

Baseline when this plan was written: `15dbe84f388355bbc2ee816a475b3ee2d36a1527`

Architecture: [architecture.md](./architecture.md)

Task brief template: [codex-task-template.md](./codex-task-template.md)

## Delivery model

Implementation is performed by Codex Cloud tasks. Every task starts from the latest orchestrator-pushed `origin/scripts`, works on a dedicated branch, and returns a reviewable commit or commit series. Subtasks do not merge other branches and do not expand their assigned scope. The orchestrator reviews and merges tasks in dependency order.

Do not launch every task from the original baseline. Work proceeds in waves. After a wave is merged and validated, the orchestrator pushes the updated `scripts` branch; the next wave starts from that new SHA.

One task should have one primary objective and one coherent validation story. If a task requires independent frontend and Rust changes that cannot be tested separately, it is an integration task and runs after its leaf tasks have landed.

## Ownership and conflict policy

Most feature work must remain under `src/script/` or `src-tauri/src/script/`.

These are integration-owned files. Leaf tasks should not edit them unless their brief explicitly grants ownership:

- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `src/views.tsx`
- `src/App.tsx`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/*.json`
- shared WDIO configuration

`src-tauri/src/script/mod.rs` is an expected aggregation point. When two backend leaf tasks add non-overlapping module declarations, the orchestrator resolves the conflict by retaining the union. No leaf task may rewrite unrelated declarations there.

Only the task assigned dependency ownership may update a lockfile. If another task discovers a dependency requirement, it records the exact package and reason in its handoff rather than editing package files opportunistically.

## Milestones

### Milestone A: analyzable editor

A persisted single-file TypeScript project can be edited. DTM types, diagnostics, and completions work. Supported `dtm.input()` and `dtm.param()` calls produce controls, but no user code executes.

### Milestone B: manual trusted execution

A user can explicitly trust and manually run a dependency-free script in bundled Bun. Inputs and outputs are file-backed, cancellation works, and errors are displayed. Automatic reruns remain disabled.

### Milestone C: live scripting MVP

Source and parameter changes are debounced, stale runs cannot replace current state, inlay hints reflect runtime values, and the last good output remains visible across errors and restarts.

### Milestone D: packages and Sharp

Projects can explicitly install locked dependencies and use Sharp on supported release targets. This is intentionally post-MVP.

## Dependency graph

```text
S00 shared contracts and scaffold
 |
 +-- S01 Monaco/Vite viability -------- S12 editor foundation ----+
 |                                                                |
 +-- S02 Bun packaging viability ------ S13 runner core ----------+--- S20 script service
 |                                                                |          |
 +-- S03 production security baseline ----------------------------+          |
 |                                                                           +-- S40 backend integration
 +-- S10 static analyzer ----------------------------------------------------+          |
 |                                                                                     |
 +-- S11 project persistence ----------------------------------------------------------+
 |
 +-- S14 input materialization ------------------------------+
 |                                                           +--- S20 script service
 +-- S15 output registry/protocol ----------------------------+

S11 + S12 ---------------- S30 project/editor controller -----+
S10 + S12 ---------------- S31 controls and inlay hints -------+--- S41 frontend integration
S12 + shared run contract -- S32 run UI, diagnostics, preview -+          |
                                                                           +-- S42 live-run race hardening
                                                                                      |
                                                                                 S43 MVP validation

S43 -- S50 package environment -- S51 package UI/type sync -- S52 Sharp acceptance
```

## Wave 0: freeze the common contract

### S00 — Shared contracts and feature scaffold

Objective: create the smallest compiling feature skeleton and freeze the types that parallel work will share.

Scope:

- Create the `src/script/` and `src-tauri/src/script/` module roots.
- Define frontend domain and wire types for projects, controls, inputs, run snapshots, output metadata, diagnostics, and tagged events.
- Define serde-equivalent Rust types with camelCase wire names.
- Define schema-version fields for persisted project and run manifests.
- Add serialization fixture tests proving the TypeScript examples and Rust JSON agree.
- Wire only enough module declarations for these tests to compile; do not add UI, persistence, or execution.

Primary paths:

- `src/script/contracts/**`
- `src-tauri/src/script/types.rs`
- `src-tauri/src/script/mod.rs`
- narrowly required module declaration in `src-tauri/src/lib.rs`

Exit criteria:

- Contract fixtures cover every variant.
- Rust and TypeScript naming agree.
- Later tasks can import types without redefining them.
- No process can be started.

This task lands before any implementation wave.

## Wave 1: retire the highest-risk unknowns

S01, S02, and S03 may run in parallel after S00. They own different shared surfaces.

### S01 — Monaco and Vite viability

Objective: prove Monaco TypeScript support works in DTM's Vite build and packaged webview before building editor features around it.

Scope:

- Add the pinned Monaco dependency and required worker configuration.
- Build a minimal internal harness under `src/script/editor/`.
- Register a virtual DTM declaration file.
- Prove diagnostics, completion, and a custom inlay-hint provider.
- Measure/report the production bundle impact.
- Do not add the Image Scripts navigation entry.

Owned shared files:

- `package.json`
- `package-lock.json`
- `vite.config.ts`

Exit criteria:

- `npm run build` succeeds.
- A focused browser/component test proves the DTM declaration is visible.
- The handoff records packaged WKWebView validation if Cloud can perform it, otherwise identifies it as a required local gate.

### S02 — Pinned Bun packaging and cancellation viability

Objective: prove DTM can prepare, package, locate, start, and terminate its own pinned Bun binary on supported targets.

Scope:

- Choose and document the checksum-pinned Bun artifact preparation mechanism.
- Add target-triple sidecar configuration without exposing Bun to frontend shell permissions.
- Add a minimal Rust probe that validates the Bun version and runs a no-op script.
- Demonstrate graceful termination followed by forced process-group termination.
- Address universal macOS artifact preparation explicitly.
- Do not implement the DTM runner API or user project execution.

Owned shared files:

- `src-tauri/tauri.conf.json`
- build/preparation scripts specifically needed for Bun
- narrowly required Rust dependencies in `src-tauri/Cargo.toml` and `Cargo.lock`

Exit criteria:

- A pinned version and checksum policy are recorded.
- The no-op process starts and is cancellable through Rust.
- Linux and both macOS architectures have a defined artifact path.
- Any Cloud limitation around signing/notarization is called out for local validation.

Do not commit large binary artifacts unless the repository owner has explicitly approved that distribution strategy.

### S03 — Production execution-security baseline

Objective: ensure the production application does not expose unrelated test execution surfaces before adding Bun.

Scope:

- Gate `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver` behind debug assertions or a dedicated E2E feature.
- Preserve the existing E2E workflow through the chosen feature/configuration.
- Confirm there is no general frontend permission to execute the Bun sidecar.
- Record the existing broad filesystem/asset capabilities as background risk; do not refactor unrelated application permissions in this task.

Owned shared files:

- `src-tauri/src/lib.rs`
- relevant `src-tauri/capabilities/*.json`
- narrowly required E2E launcher/configuration files

Exit criteria:

- Production configuration excludes the WebDriver server.
- E2E builds still have an intentional way to enable it.
- Tests or build inspection prove both configurations.

## Wave 2: build independent feature cores

Start these tasks only after Wave 1 is merged and `origin/scripts` has advanced. S10, S11, S12, and S13 can then run in parallel.

### S10 — TypeScript analyzer and instrumentation

Objective: implement the pure, worker-safe analysis engine.

Scope:

- Parse TypeScript with the compiler API.
- Find the supported `createImageProcess` callback and direct DTM calls by binding identity.
- Infer labels, validate overloads, and produce control descriptors.
- Generate deterministic control IDs, instrumented source, and a source map.
- Produce source-ranged analyzer diagnostics.
- Keep the last-valid-analysis policy outside the pure analyzer.

Primary paths:

- `src/script/analysis/**`

Required tests:

- Comments and strings do not match.
- Shadowed and unrelated `dtm` identifiers do not match.
- Incomplete and invalid source returns useful diagnostics without crashing.
- Variable and conditional initializers infer expected labels.
- Explicit IDs win; duplicate IDs are rejected.
- Both numeric overloads normalize to one descriptor form.
- Instrumentation preserves behavior and source mapping.
- Unicode offsets agree with Monaco/TypeScript UTF-16 positions.

Exit criteria: this package has no React, Tauri, or Monaco dependency and is exhaustively unit tested.

### S11 — Atomic script-project persistence

Objective: implement app-managed project storage without introducing execution.

Scope:

- Validate project IDs and paths.
- Create, list, open, rename, and atomically save single-file projects.
- Persist a versioned `dtm.json` and `process.ts`.
- Keep private runtime state separate from portable project files.
- Add a storage trait or test path injection so tests use temporary directories.
- Do not delete projects in the first task unless deletion and recovery semantics are explicitly specified.

Primary paths:

- `src-tauri/src/script/paths.rs`
- `src-tauri/src/script/project_store.rs`
- focused project command wrappers under `src-tauri/src/script/`

Required tests:

- Round-trip create/open/save.
- Interrupted/failed save leaves the previous source intact.
- Path traversal and malformed manifests fail closed.
- Unsupported schema versions produce an actionable error.
- Private state does not appear in an exported project directory.

### S12 — Editor foundation

Objective: turn the Monaco viability harness into a reusable editor package.

Scope:

- Manage one stable Monaco model per project URI.
- Load and dispose the DTM declaration library correctly.
- Expose model revision, dirty state, diagnostics, editor view state, and custom marker owners.
- Provide a worker client boundary for S10 without implementing control UI.
- Avoid mirroring the full source into React or Valtio state.

Primary paths:

- `src/script/editor/**`

Required tests:

- Switching projects preserves separate undo/view state.
- Disposing a project releases its model and providers.
- DTM declarations do not accumulate on remount.
- Model revision events are deterministic.

### S13 — Bun runner core

Objective: implement a dependency-free runner behind an executor abstraction.

Scope:

- Define an executor trait used by the future service and a deterministic fake executor for tests.
- Create an immutable run directory and manifest.
- Implement the Bun runtime bootstrap and exactly-one-process registration rule.
- Capture capped stdout/stderr as logs.
- Write success or failure through an atomic result manifest.
- Support a fixed-PNG fixture result without external packages.
- Implement timeout and process-group cancellation using the mechanism proven by S02.

Primary paths:

- `src-tauri/src/script/executor.rs`
- `src-tauri/src/script/bun.rs`
- `src-tauri/src/script/runtime/**`

Required tests:

- Zero or multiple registrations fail.
- User stdout cannot forge a success result.
- Timeout and explicit cancellation are distinguishable.
- A child subprocess is terminated with its process group.
- Missing, partial, oversized, or malformed result manifests fail.

## Wave 3: backend leaves and service

S14 and S15 may run in parallel after S00 and should be merged before S20. Start S20 only after S11, S13, S14, and S15 are all present on `origin/scripts`.

### S14 — Input selection and materialization

Objective: convert approved input selections into run-local files without passing image bytes through JSON.

Scope:

- Implement local-file input selection and streaming copy.
- Implement a Draw Things `ResourceHandle` adapter.
- Detect and return filename and media-type metadata.
- Reject missing, unsupported, oversized, or invalid inputs.
- Never hard-link an original input into an untrusted run directory.

Primary paths:

- `src-tauri/src/script/input.rs`
- focused tests and fixtures under the script module

Required tests:

- Original files cannot be modified through staged inputs.
- Resource and local-file paths produce the same runtime contract.
- Multiple inputs use isolated IDs and filenames.
- Cancellation or failure cleans partial copies.

### S15 — Output registry and script-output protocol

Objective: validate file-backed results and expose only opaque preview URLs.

Scope:

- Canonicalize and validate output containment.
- Validate allowed media types and configured size limits.
- Create an opaque-token registry with explicit lifetime/eviction behavior.
- Implement a responder for `dtm://script-output/<token>` without modifying the global protocol router.
- Keep the registry independent of `DTPService`.

Primary paths:

- `src-tauri/src/script/output.rs`
- `src-tauri/src/script/protocol.rs`

Required tests:

- Traversal and symlink escape are rejected.
- Unknown and expired tokens fail.
- Tokens reveal no filesystem path.
- Replacing an output does not delete a file still needed by the active preview.
- Oversized and unsupported files are rejected.

### S20 — Script service, trust gate, and event lifecycle

Objective: compose storage, runner, input, and output leaves into a stateful service without global Tauri wiring.

Scope:

- Manage one active run globally.
- Create immutable source/value/input snapshots and backend run IDs.
- Enforce project trust before starting a process.
- Emit typed lifecycle, log, diagnostic, success, failure, and cancellation events.
- Cancel a previous run only when its valid replacement is ready to start.
- Preserve the last successful output across later failures.
- Implement bounded cleanup and explicit shutdown.

Primary paths:

- `src-tauri/src/script/service.rs`
- `src-tauri/src/script/commands.rs`
- script-local tests

Required tests use the fake executor:

- Untrusted projects cannot run or auto-run.
- At most one process is active.
- Late completion from an old run cannot replace current output.
- Cancellation escalation happens once and reaches a terminal event.
- Service shutdown stops the runner before temp cleanup.
- Event revisions match the immutable request snapshot.

## Wave 4: frontend leaves

S30, S31, and S32 can run in parallel after the relevant lower-level tasks are merged. They must use mocked command and event adapters and must not add the global view entry.

### S30 — Project/editor controller

Objective: connect project persistence to Monaco with autosave and recoverable state.

Scope:

- Project list and current-project state.
- Create/open/rename operations.
- Debounced autosave with revision acknowledgements.
- Dirty, saving, saved, and save-error states.
- Restore last project and editor view state without auto-running it.

Primary paths:

- `src/script/project/**`

Required tests:

- Rapid edits save only the latest revision.
- An old save acknowledgement cannot mark newer source as saved.
- Switching projects flushes or safely retains pending work.
- Reload restores source without starting a run.

### S31 — Generated controls and runtime inlay hints

Objective: reconcile analyzer descriptors with independent runtime values and render accessible controls.

Scope:

- Image input, number, slider, boolean, and text controls.
- Explicit/inferred labels and stable ID reconciliation.
- Touched/default/reset behavior.
- Validation and visible clamping for changed constraints.
- Monaco inlay hints showing current values and selected filenames.
- Preserve the last valid control schema while analysis is temporarily invalid.

Primary paths:

- `src/script/controls/**`
- narrowly scoped provider code under `src/script/editor/` if agreed with S12's contract

Required tests:

- Parameter changes never modify source.
- Untouched values follow edited defaults; touched compatible values persist.
- Type changes reset values.
- Control removal and duplicate IDs are deterministic.
- Inlay positions and values update without recreating the Monaco model.

### S32 — Run UI, diagnostics, and preview

Objective: render backend run state without owning scheduling policy.

Scope:

- Manual Run and Stop controls.
- Trust warning and trust-state presentation.
- Typed event adapter and run status display.
- Separate problems and capped-log presentation.
- Inline image preview using the opaque URL.
- Last-successful-preview and stale-revision indication.

Primary paths:

- `src/script/run/**`
- `src/script/preview/**`

Required tests:

- Failure does not erase the last good output.
- Stale events do not alter current UI state.
- Stop is enabled only for the active run.
- Trust is required before the run request is sent.
- Full local paths are not rendered in hints or routine UI.

## Wave 5: vertical integration and MVP behavior

These tasks are sequential and orchestrator-heavy. Start each from the branch produced by the prior task.

### S40 — Backend application integration

Objective: register the script service and commands in Tauri and integrate shutdown and the custom protocol.

Scope:

- Manage `ImageScriptService` in application setup.
- Register script commands.
- Route `dtm://script-output` independently of `dtproject`.
- Stop the service before clearing the shared temp directory.
- Add only the minimum capabilities required by the frontend command surface.
- Preserve the production security baseline from S03.

Owned shared files:

- `src-tauri/src/lib.rs`
- required `src-tauri/capabilities/*.json`
- script-related Tauri configuration

Exit criteria:

- Backend integration tests and `cargo check --locked` pass.
- Projects need not be connected to create/open a script project.
- No frontend command can spawn an arbitrary executable.

### S41 — Frontend workspace integration

Objective: compose the frontend leaves into the new Image Scripts view.

Scope:

- Add the lazy navigation entry.
- Compose project selector, Monaco editor, generated-control inspector, run state, diagnostics, logs, and preview.
- Follow DTM's Valtio `snap`/mutable-state conventions.
- Add mock-Tauri support for the new commands and events.
- Keep layout usable at DTM's minimum window size.

Owned shared files:

- `src/views.tsx`
- narrowly required application/navigation files
- `src/mocks/**` additions for script commands

Exit criteria:

- Web mock mode can exercise the whole view without Bun.
- Production frontend build passes.
- Opening the view never auto-runs a project.

### S42 — Live execution, debounce, and race hardening

Objective: turn the manual vertical slice into the live scripting MVP.

Scope:

- Analyze after a short editor debounce.
- Schedule source runs only after valid analysis and complete required inputs.
- Debounce parameter changes separately and run immediately on slider commit.
- Cancel the old process only when a valid replacement is accepted.
- Track source, value, and input revisions independently.
- Ignore all stale analyzer and backend events.
- Keep a visible manual-run/live-run toggle.

Primary paths:

- `src/script/workspace/**`
- focused changes to existing script feature modules

Required tests:

- Rapid typing produces one final run.
- Invalid intermediate text does not clear controls or kill the last run prematurely.
- Rapid slider changes cannot publish an obsolete preview.
- Switching projects cancels or detaches correctly.
- A late success after cancellation is ignored.

### S43 — MVP end-to-end validation and release gate

Objective: validate the integrated dependency-free feature rather than add new capabilities.

Scope:

- Add focused WDIO coverage for create, persist, analyze, select input, trust, run, preview, error, cancellation, and reload behavior.
- Add a real Bun integration test using a small checked-in image fixture or existing prepared fixture.
- Exercise output limits, path validation, and shutdown cleanup.
- Validate a release-config build with WebDriver disabled.
- Update user-facing and developer documentation.
- Fix only defects discovered within the MVP scope.

Exit criteria:

- All narrow unit/integration suites pass.
- The relevant frontend build, Rust check/tests, and WDIO spec pass.
- macOS packaged-app Bun and WebKit behavior is validated locally if Cloud cannot perform signing/UI checks.
- Remaining security limitations are explicit in user-facing copy.

Milestone C is complete only after S43.

## Post-MVP package milestone

### S50 — Locked package environment

Add explicit dependency commands, per-project `package.json` and `bun.lock`, frozen-lock restoration, install progress/cancellation, and lifecycle-script trust policy. Disable runtime auto-install. Test cache corruption, lock mismatch, cancellation, and unsupported platform packages.

### S51 — Package UI and TypeScript declaration sync

Add dependency management UI and make installed package declarations available to the editor. Keep the language-service adapter boundary so a real `tsserver` bridge can replace Monaco virtual libraries if arbitrary-package resolution becomes unreliable.

### S52 — Sharp acceptance

Add the documented Sharp result adapter and an example template. Validate install and execution on macOS ARM64, macOS x64/universal distribution, and supported Linux. Confirm cancellation, memory behavior, output metadata, and lockfile portability.

### S60 — Stronger isolation investigation

Separately evaluate an OS-level helper sandbox or capability broker. Do not block the trusted-local MVP on this investigation, but do not market untrusted script execution until it produces an enforceable filesystem/network/process policy.

## Orchestrator procedure

For every wave:

1. Record the exact `origin/scripts` SHA.
2. Create task briefs from the template with explicit allowed and integration-owned paths.
3. Dispatch only tasks whose dependencies are already on that SHA.
4. Require every task to report its commit SHA, changed paths, tests, limitations, and contract changes.
5. Review diffs before merging; do not accept a task merely because its tests are green.
6. Merge leaf tasks before their integration task. Resolve aggregation-file conflicts as unions, not by taking one side wholesale.
7. Run `git diff --check` and the narrow union of affected checks after every merge.
8. After the complete wave, run the broader wave gate, push `scripts`, and give the next tasks the new SHA.
9. If a merged task changes a frozen shared contract, pause dependent tasks and update their briefs before continuing.

The orchestrator owns cross-feature fixes, shared wiring, and conflict resolution. A subtask that discovers required work outside its assigned paths should report it instead of editing it.

## Validation expectations for Cloud tasks

Use the repository scripts and `AGENTS.md` as the command authority. Fresh Cloud worktrees may require generated icons and test fixtures before commands that compile Tauri context or run Rust/WDIO tests.

Each task runs the narrowest relevant tests. Integration tasks then run the union. Every handoff explicitly distinguishes:

- Passed checks.
- Failed checks caused by the task.
- Pre-existing or environment failures.
- Checks not run.
- Packaged macOS behavior that still needs local validation.

No task should claim signing, notarization, universal-binary behavior, native picker behavior, or packaged WKWebView behavior based only on a web mock or unit test.

