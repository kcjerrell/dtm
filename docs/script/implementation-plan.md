# Image scripting implementation plan

Status: Backend through S20 and frontend S30–S32 committed and reviewed; Wave 5 integration ready to start

Target branch: `origin/scripts`

Baseline when this plan was written: `15dbe84f388355bbc2ee816a475b3ee2d36a1527`

Architecture: [architecture.md](./architecture.md)

Task brief template: [codex-task-template.md](./codex-task-template.md)

## Delivery model

Implementation is performed by Codex Cloud tasks. Every task starts from the latest orchestrator-pushed `origin/scripts`, works on a dedicated branch, and returns a reviewable commit or commit series. Subtasks do not merge other branches and do not expand their assigned scope. The orchestrator reviews and merges tasks in dependency order.

Execution override for S14 and S15 (2026-10-15): run local subtasks sequentially in the existing checkout, with medium reasoning, without worktrees or additional delegation. The orchestrator reviews and validates S14 before dispatching S15. These subtasks do not commit, push, or change branches; their changes remain available for local review.

Execution override for S32 (2026-11-03): use a local delegated worker in the existing clean checkout, starting at `87b8cc68fe3dbd91d00924248add5ccc7d6a436e`, with a separate read-only Wave 5 readiness review. The worker owns only `src/script/run/**` and `src/script/preview/**`; the orchestrator owns documentation, review, validation, and commits. There is no Cloud implementation launcher available in this session. Do not start S40–S43 as part of this handoff preparation.

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

## Progress review (2026-11-03)

| Work | Current state | Remaining gate |
| --- | --- | --- |
| S00–S03 | Contracts, editor/Bun viability, and production WebDriver exclusion implemented | Packaged macOS/runtime and distribution checks remain release gates |
| S10–S15 | Analyzer, persistence, editor, runner, input staging, and opaque output core implemented | Application adapters and registration belong to Wave 5 |
| Pre-S20 repairs | Committed in `34a318597e412ea22d7bcb14fa539c1fe7783d05` | No longer an uncommitted prerequisite |
| S20 | Committed in `5c2a3ff1` | Service/commands/events/protocol/shutdown registration in S40 |
| S30 | Committed in `96796a118785800960118ae11d5bcafaf8c49ad8` | Workspace and real IPC composition in S41 |
| S31 | Committed in `87b8cc68fe3dbd91d00924248add5ccc7d6a436e` | Native input adapter, analyzer transport, and scheduling in Wave 5 |
| S32 | Committed in `0ab7b234f5f3121dfc25593247f88735a86993d9` after review | Real commands/events and workspace composition in S40/S41; live scheduling in S42 |
| S40–S43 | Not started | Sequential integration, live behavior, and release acceptance |

The leaves establish the foundations for Milestones A–C; none of those application-level milestones is accepted merely because leaf tests pass. The Image Scripts view, global service, and real command/event adapters are not mounted yet. Milestone C remains gated on S43.

At review start the checkout was clean on `scripts` at `87b8cc68fe3dbd91d00924248add5ccc7d6a436e`; live `origin/scripts` was verified at `34a318597e412ea22d7bcb14fa539c1fe7783d05`, three commits behind. A later Cloud dispatch must first publish and verify an exact base containing all completed leaves; a local continuation can use the final reviewed local commit.

Fresh baseline checks: all 71 frontend script tests and 72 Rust script-library tests pass, including the prepared host Bun paths; the production WebDriver exclusion check passes. Repository-wide TypeScript still reports 19 pre-existing errors (18 elsewhere in the application and the contract-fixture literal/brand typing error). Track these separately from scoped feature validation; a frontend production build alone does not establish TypeScript correctness or packaged behavior.

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

Wave 2 was reviewed at `20aa547b033076cfc4871d13e4d4c141bd37e5f3`. S10–S13 are substantially implemented; the focused 28 frontend and 33 Rust script tests pass. The feature is not yet wired into the application.

S14 and S15 can proceed independently of the repairs below. For the current execution, run S14 first, review and validate it, then run S15 in the same local checkout. Start S20 only after S11, S13, S14, S15, and the following prerequisite repairs have been reviewed and integrated. Publish the resulting branch before any later Cloud task starts.

### Review repairs before S20 — committed

Repair status: the four items below were implemented against `be3921c` and committed in `34a318597e412ea22d7bcb14fa539c1fe7783d05`. At the 2026-10-15 repair gate, the 60-test Rust script-library union and 29 frontend script tests passed, including actual bundled Bun execution. Focused strict TypeScript, Biome, frontend production build, Rust check/formatting, and diff integrity checks passed. S20 subsequently landed separately; application wiring remains pending.

- S10 now rejects nested calls capturing the actual DTM callback parameter with source-ranged diagnostics. Unrelated/shadowed receivers remain ignored; nested control discovery remains outside the MVP grammar.
- S13 now accepts a valid existing run-local output directory when user code creates and returns a file within it. A real Bun regression covers this case; the S15 containment/validation boundary is preserved.
- The S13/S20 interface now emits actual process-start and bounded live-log notifications and returns structured import/compile, user-runtime, and runner/protocol failures. Raw stderr and the frozen frontend wire contracts are preserved.
- The S13 fake now supports explicitly gated start/completion, live logs, and cancellation observation for overlapping-request, late-completion, and shutdown tests without sleeps. The immediate-result convenience queue remains available.

S20 should consume the reviewed interface below. Any additional executor/runtime changes require explicit task ownership; keep unrelated input/output leaves focused. Packaged WKWebView, universal/Intel Bun, signing/notarization, and DMG packaging remain later platform gates.

S20 executor integration contract:

- Use `ScriptExecutor::execute_prepared_observed(prepared, cancellation, ExecutionObserver::new(sink))` after input transfer and output-root authorization capture. Existing `execute_prepared`/`execute` convenience methods use a no-op observer. Each event carries the immutable `RunIdentity`; `Started` occurs only after spawn and before any logs. Observers may be called concurrently by stdout/stderr readers and must return promptly without panicking or holding a service lock across execution. The executor introduces no unbounded event queue.
- `ExecutionEventKind::Log` contains deltas capped at 64 KiB of raw bytes per stream, with a truncation flag. Streams continue draining after the cap; split UTF-8 sequences are preserved. `ExecutionResult.logs` contains authoritative final aggregates, which must not be appended as a second set of deltas.
- `ExecutionTerminal::Failed(ExecutionFailure)` distinguishes `Import`, `UserRuntime`, and `Runner`, with a bounded message, optional stack, and optional one-based instrumented-entry location. Bun aggregate build diagnostics supply the first underlying diagnostic and its position. Preserve the immutable source map for later mapping; these raw locations have not been mapped to editor source. Raw stderr remains separately capped. Host preparation/spawn/IO errors remain `anyhow::Result::Err` with context.
- `FakeExecutor::queue_controlled()` returns a per-run control. Dispatch execution, await `entered()`, open `start()`, observe `Started`, inject optional `log()` deltas, and finish with `complete(terminal)`. `cancelled()` observes explicit cancellation or sender-disappearance shutdown. Cancellation does not auto-complete a controlled fake: tests may deliberately finish an old run successfully after cancellation. Await the execution task before service-owned cleanup. Fake preparation creates real isolated input directories, allowing the S14/S15 adapters to compose in service tests.

### S14 — Input selection and materialization

Objective: convert approved input selections into run-local files without passing image bytes through JSON.

Local status (2026-10-15): implemented and reviewed in the existing checkout, then integrated in `be3921c`. Eight focused input tests and the original 41-test script-library union passed, including a real Bun staging/preparation/transfer/execution round trip; the current repair gate above covers the expanded suite. Application command wiring remains S40 work.

Integration API: `InputApprovals` owns expiring local-selection capabilities; `InputResources` injects `ResourceHandle` resolution. Call `stage_inputs`, populate the immutable manifest from `StagedInputs::inputs()`, call executor `prepare`, consume staging with `transfer`, then `execute_prepared`. Dropping staging or an unstarted preparation cleans private files.

Known bound: local copies stream with byte limits; the existing `ResourceHandle::get_image` API allocates its complete encoded image before this module can enforce a byte cap. PNG/JPEG validity checking temporarily decodes within dimension/allocation limits, retaining no decoded image afterward. Cancellation is checked around decoding. Windows-specific entropy support has not been validated locally.

Scope:

- Implement local-file input selection and streaming copy.
- Implement a Draw Things `ResourceHandle` adapter.
- Detect and return filename and media-type metadata.
- Reject missing, unsupported, oversized, or invalid inputs.
- Never hard-link an original input into an untrusted run directory.
- Stage and validate approved copies before freezing the run manifest: compute byte length, content hash, and detected media type from the staged bytes, then prepare the immutable run and transfer the staged copies to its declared input paths. Avoid rereading large originals solely to obtain manifest metadata; never move or link the originals. Keep this staging API usable without Tauri application wiring or a connected Projects database.
- Use backend-owned opaque approval tokens for local selections; do not accept arbitrary frontend filesystem paths as run selections. Keep Draw Things resource resolution behind an injectable adapter.
- Generate isolated backend filenames independently of display names. The same approved file/resource may be selected by multiple controls, and different sources may share a basename; neither is a duplicate input identity.

Primary paths:

- `src-tauri/src/script/input.rs`
- focused tests and fixtures under the script module

Required tests:

- Original files cannot be modified through staged inputs.
- Resource and local-file paths produce the same runtime contract.
- Multiple inputs use isolated IDs and filenames.
- Cancellation or failure cleans partial copies.
- Manifest metadata describes the actual staged bytes, including when the original changes after selection.
- Traversal in staged paths, duplicate input IDs or actual staging filenames, and unapproved or expired selections fail closed. Repeated source selections and duplicate display names remain supported.

### S15 — Output registry and script-output protocol

Objective: validate file-backed results and expose only opaque preview URLs.

Local status (2026-10-15): implemented and reviewed after S14, in the same checkout with medium reasoning, then integrated in `be3921c`. Eight output tests, two protocol tests, and the original 51-test script-library union passed. `cargo check --locked`, Rust formatting, and diff integrity checks also passed; the current repair gate above covers the expanded suite. Coverage includes real Bun execution through authorization capture, output validation/retention, protocol response, and run-directory cleanup. Global protocol routing remains S40 work.

Integration API: call `AuthorizedOutputRoot::from_prepared(&prepared)` before `execute_prepared` consumes the run. After successful execution, call `OutputRegistry::register(&anchor, &output)` and retain the returned `OutputLease` for the last-good preview. `protocol::respond` acquires a read lease and returns owned response bytes. `expire`, `evict`, and `clear` revoke token lookups; private copies remain until their final lease drops. The service must keep the private storage root alive until leases finish. Registration and protocol reads are blocking operations and must run on blocking workers from async application handlers.

S15 reuses S14's bounded PNG/JPEG validator and secure token helper; future task bases must include both leaves. Retention accounts for revoked-but-leased files and permits one additional bounded file during serialized validation. Secure descriptor-relative output containment is implemented on Unix; other platforms fail closed pending a safe handle implementation. Packaged WKWebView protocol behavior and non-macOS execution are unverified. A Unix socket test fixture encountered sandbox `EPERM` and was removed; directory/FIFO rejection remains covered without opening sockets.

Scope:

- Canonicalize and validate output containment.
- Validate allowed media types and configured size limits.
- Create an opaque-token registry with explicit lifetime/eviction behavior.
- Implement a responder for `dtm://script-output/<token>` without modifying the global protocol router.
- Keep the registry independent of `DTPService`.
- Detect image media type from validated file contents rather than trusting the runner's declaration or filename (the current runner defaults byte/path results to PNG). Reject malformed images and enforce bounded validation without unnecessary full-image decoding.
- Define ownership of retained output files and active response leases explicitly. Token expiry/replacement must not remove files still needed by an active preview or response; expose a cleanup boundary for the future service.
- Capture the authorized run-directory handle from the prepared execution before spawning user code. Validate results beneath that handle's fixed `output/` subtree; canonicalizing a script-controlled output directory after execution must never establish its authorization. S20 must retain this anchor through result registration.

Primary paths:

- `src-tauri/src/script/output.rs`
- `src-tauri/src/script/protocol.rs`

Required tests:

- Traversal and symlink escape are rejected.
- Unknown and expired tokens fail.
- Tokens reveal no filesystem path.
- Replacing an output does not delete a file still needed by the active preview.
- Oversized and unsupported files are rejected.
- Misleading media-type declarations/extensions and malformed image contents cannot bypass validation.
- Replacing the run/output directory or its descendants with symlinks cannot redefine the authorized root.
- Protocol responses preserve the detected content type and do not expose filesystem paths in error bodies.

### S20 — Script service, trust gate, and event lifecycle

Objective: compose storage, runner, input, and output leaves into a stateful service without global Tauri wiring.

Local status (2026-10-20): `ImageScriptService` and the script command surface are implemented and validated in the existing checkout. Global application registration remains S40 work.

Integration API and ownership:

- Construct one global `ImageScriptService` with injected `ProjectStore`, executor, input approvals/resources, limits, and a prompt, nonblocking event sink. It works without `DTPService`. `output_registry()` supplies the registry for the later protocol routing.
- `trust_project` acknowledges the UI's explicit trusted-script warning. Approval is session-local, never exported, and keyed to the saved project's source hash. Run admission reopens the project and revokes approval on changed contents. Opening a project never approves or runs it. Route editor saves through `save_project` / `save_trusted_script_project` to preserve approval across service-owned saves; using the original storage-only save command fails closed on the next run after a source change. S40 must choose the service save route.
- `run` takes an owned request, recomputes its source hash, assigns an opaque backend run ID, and freezes source, map, values, revisions, and materialized inputs. Source/maps/value snapshots and admission are bounded (at most eight submissions). Syntax/analyzer blocking remains the frontend analyzer/controller's responsibility; this service consumes the prepared analysis snapshot rather than adding a second analyzer.
- A serialized handoff prepares and transfers inputs and captures the output anchor before requesting cancellation of the prior run. It then awaits that executor's single terminal outcome and cleanup before executing the replacement. Caller disconnection cannot detach that join. `cancel` stops pending preparation and the active process; the first cancellation reason wins. A cancelled run's late success cannot publish an output.
- Typed queued/started/log/diagnostic/terminal events retain immutable request revisions. Live logs are forwarded once. Failure phases remain distinct; `last_failure()` retains one bounded raw failure and its immutable source/map for later location mapping. Raw instrumented positions are not presented as editor positions.
- Output validation and cleanup run on blocking workers. `last_success()` preserves the latest successful identity and preview metadata across subsequent failures. Finalization begins atomically after process termination: earlier cancellation wins; later Stop requests cannot revoke a preview being validated/published. The next process still waits for finalization.
- Await `shutdown()` before application temp cleanup. It closes admission, cancels pending work/execution, joins the worker, clears retained registry lookups, and removes the private session workspace. Already-acquired response leases remain usable because their retained files live outside the session workspace. Normal run cleanup happens after each outcome; cleanup failures emit a warning and remaining session files are retried at shutdown. Explicit shutdown is required before dropping the application service.

Validation (2026-10-20): all 72 Rust script-library tests pass, including twelve new service tests; `cargo check --locked`, Rust formatting, and diff integrity checks pass. Service regressions use controlled fake gates without synchronization sleeps; a real pinned-Bun round trip covers approved local input, event ordering, opaque preview bytes, original-file preservation, and cleanup. The final frontend script run passed 28/29 tests with one unchanged `monacoApi.browser.test.ts` model-lifecycle test hitting its existing five-second timeout, including in serial reruns. Earlier runs also timed out in the TypeScript-worker viability test, which passed in the final run. No frontend files or timeout limits were changed. Packaged UI/protocol behavior and WDIO feature integration were not tested; application wiring remains a later integration gate.

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

Use the reviewed executor integration contract above. No executor redesign or frontend wire-contract change is required for S20. Read `executor.rs` and `executor/fake.rs` alongside the input/output leaves before implementing the service.

Required tests use the fake executor:

- Untrusted projects cannot run or auto-run.
- At most one process is active.
- Late completion from an old run cannot replace current output.
- The service requests cancellation once and awaits a single terminal outcome. The executor owns process-group TERM/KILL escalation; its actual process cleanup remains covered by real Bun tests, rather than simulated signal assertions in the fake.
- Service shutdown stops the runner before temp cleanup.
- Event revisions match the immutable request snapshot.

## Wave 4: frontend leaves

S30, S31, and S32 can run in parallel after the relevant lower-level tasks are merged. They must use mocked command and event adapters and must not add the global view entry.

### S30 — Project/editor controller

Objective: connect project persistence to Monaco with autosave and recoverable state.

Local status: implemented in `src/script/project/` after S20 commit `5c2a3ff`; S30 is committed in the S31 starting base `96796a118785800960118ae11d5bcafaf8c49ad8`. Navigation and workspace mounting remain S41 work; no application entry or global command registration was added.

Integration API:

- Construct `ScriptProjectController` with injected `ProjectCommands`, model/editor bindings, local session storage, and an optional autosave delay (300 ms by default). Its Valtio `state` holds project manifests, current-project identity, loading/operation errors, and per-document revision/dirty/saving/saved/save-error metadata. Render with a snapshot; source, models, timers, write queues, and navigation generations stay outside render state.
- `createProjectEditorBindings` composes the existing S12 `ScriptModelRegistry` and `ScriptEditorSession`, retaining per-project models and undo stacks. The host owns the registry and editor. `createProjectCommands(invoke)` supplies the existing list/create/open/rename calls and uses S20's `save_trusted_script_project` for revision-acknowledged saves that preserve existing trust without granting it.
- Await `initialize()` to list projects and restore a known last project. `open`, `create`, and `rename` implement project operations; a newer navigation wins over a late load or restore. Initialization merges projects created while listing was pending. Open models retain unsaved work rather than being overwritten on another open.
- Model revision events debounce autosaves. Each write captures source and revision together; writes for a project are serialized, rapid edits coalesce, and stale acknowledgements cannot mark newer source saved. A mismatched acknowledgement fails closed. Failed writes remain dirty with an error and can be retried with `flush()`; switching flushes the current model and stays on it if that save fails.
- `createLocalProjectSessionStorage(storage)` keeps versioned last-project/view metadata only, caps metadata size and retained views, and ignores malformed/versionless data. Scroll/cursor events persist view state after a short debounce; switching and disposal capture it immediately. Session storage failures are reported separately and never prevent source saves. Restoration has no execution adapter and never auto-runs a project.
- Await `dispose()` before editor/registry teardown. It flushes all dirty documents, persists the current view, and releases controller-owned subscriptions/models. If a save fails, disposal rejects and leaves the models available for retry; the host must retain the workspace rather than discarding that pending work. Unexpected process termination during a pending/failed save is not a durability guarantee.

Validation (2026-10-21): all 17 new project/controller/session tests and the full 46-test frontend script union pass, including the unchanged Monaco worker/model tests that previously timed out. Scoped strict TypeScript (including tests), Biome, frontend production build, and diff integrity checks pass. The repository-wide TypeScript check still reports 19 errors outside `src/script/project/` (ImageCompare, archive dialog, metadata state, scratch files, and the existing contract fixture typing). Real application IPC, packaged UI restoration, and WDIO workspace integration remain later integration checks.

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

Local status (2026-11-03): implemented in `src/script/controls/` and committed in `87b8cc68fe3dbd91d00924248add5ccc7d6a436e`, with a backward-compatible optional model filter/change event on the S12 inlay provider. Workspace mounting, native image approval/picking, and run scheduling remain integration work.

Integration API:

- Create one `ScriptControlsController({ projectId, project, analysis, selectImage? })` per S12 `ScriptProjectModel` lifetime. Keep the controller outside renderable state. Render `<GeneratedControls controller={controller} />` under the existing Chakra provider; reads use Valtio snapshots. Source, Monaco handles, listeners, request generations, and abort controllers never enter its proxy state.
- The host schedules `analyze()` using the injected `EditorAnalysisClient`; construction/rendering performs no analysis, IPC, or execution. Each promise is scoped to the requesting controller/model, generation, and captured source revision. The frozen analysis response has no project identity, so transports must correlate replies to their originating request promises. There is deliberately no revision-only response ingestion API. The host owns/disposes the analysis client, which may be shared.
- Reconciliation preserves schema order and stable IDs, applies edited defaults to untouched values, and retains touched compatible values. Number and slider descriptors share the `ControlValue` numeric type; other type changes reset. `reset(id)` restores the current normalized default (or clears an image selection) and clears touched state. Duplicate IDs or invalid analysis preserve the last valid schema atomically. Source revision changes immediately hide hints until valid matching analysis returns.
- Numeric min/max/step constraints normalize defaults and edits, with visible adjustment messages. Step snapping uses `min` or zero as its anchor. Incomplete/non-finite numeric drafts show errors while retaining the last valid runtime value; blur restores its display. S42 must consider rendered validation errors when deciding run readiness.
- `setValue`, `editNumber`, `commitNumber`, `commitValue`, `reset`, and `selectImage` supply imperative controls. `runtimeSnapshot()` returns fresh plain `values`, `inputs`, `valueRevision`, and `inputRevision` for the later run layer. Revisions change only for effective value/selection changes; presentation/range changes and control reordering do not advance them. `onDidChange(listener)` supplies a disposable event boundary with project identity, independent revisions, change kind, and change/commit phase (including slider keyboard/pointer commits).
- Inject `selectImage({ projectId, inputId, signal }) => Promise<SelectedInput | null>`. The adapter owns native approval/resource lookup and returns only opaque approval tokens/resource IDs and display names. Cancellation leaves the current selection intact; reset, supersession, valid schema replacement, and disposal abort outstanding requests and ignore late replies. Returned IDs must match; only contract fields are retained and display names are reduced to filenames. No native picker or arbitrary-path input API is provided here.
- `bindInlayHints(monaco)` registers the runtime provider for this exact model and returns a disposable binding. Value/selection/range changes fire hint refresh events; invalid/pending analysis yields no positions. Dispose the controller when discarding its project, before editor/registry teardown; model disposal also tears it down. Controller disposal unregisters providers, releases subscriptions/listeners, aborts selection requests, and rejects late analysis/selection results without disposing host-owned models/transports.

Validation (2026-11-03): all 25 new controls/provider tests and the complete 71-test frontend script suite pass using `npx vitest run src/script --maxWorkers=1 --no-file-parallelism`. Biome, scoped strict TypeScript (all changed TypeScript files/tests plus the existing Monaco worker declaration), `npm run build`, and `git diff --check` pass. The repository-wide `npx tsc --noEmit --pretty false` still reports the 19 existing errors outside S31 (ImageCompare, archive dialog, metadata state, scratch files, and contract fixture typing). Missing installed dependencies were restored from the unchanged lockfile with user authorization. Native picker/IPC, workspace mounting, WDIO, and packaged WKWebView behavior were not exercised.

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

Local status (2026-11-03): implemented and independently reviewed under `src/script/run/` and `src/script/preview/`, committed in `0ab7b234f5f3121dfc25593247f88735a86993d9`. No contracts, packages, application registration, or scheduler were changed. See [wave-5-handoff.md](./wave-5-handoff.md) for the next orchestrator.

Integration API:

- Construct one `ScriptRunController({ projectId, commands, events })` per project lifetime. Inject `createRunCommands(invoke)` and `createRunEventSource(listen, eventName)` after S40 chooses the event transport/name. Importing or constructing never performs IPC, trusts, or runs. `connect()` installs the event subscription; `run()` ensures it is installed before submission.
- Render `ScriptRunPanel`, `ScriptProblems`, `ScriptLogs`, and `ScriptPreview` under the existing Chakra provider. The host's `onRun` callback validates/flushes the exact snapshot and calls `run(request)`. Pass `canRun` from workspace readiness. Trust requires explicit warning acknowledgement and a backend response; Review trust permits explicit reapproval after a failed admission, including a terminal event preceding rejection.
- `setDesiredRevisions` tracks source/value/input revisions independently. `run` clones the request before any async boundary and accepts only the expected project/request/revisions/backend ID. Queued/started/terminal events can precede acknowledgements; terminal settlement cannot be reverted by a late acknowledgement. Obsolete content is ignored, while prior active processes remain tracked for Stop if a replacement fails during preparation.
- `state.admitting` disables overlapping admission; `run()` resolves on admission acknowledgement, not execution completion. S42 must coalesce desired changes while admission is pending, then submit the latest valid snapshot. The host generates globally unique client request IDs; the controller retains a bounded replay guard for the most recent 1,024 IDs.
- Logs are capped at 65,536 display characters and 500 entries; editor/runtime problem lists are separately capped at 100. Routine text redacts local paths, including punctuation-delimited variants, and repeated diagnostic/failed payloads are deduplicated. Problem state is sanitized presentation data without source locations: S41 must apply mapped markers from the original matching analyzer/backend payloads before presentation.
- The preview accepts only validated PNG/JPEG metadata with the S15 opaque token URL. Failures and invalid/stale success cannot erase the last good preview; staleness compares all three desired revisions. S40/S42 own registry lifetime and cross-project retention.
- `stop()` is enabled for known active/pending backend runs, waits for terminal lifecycle rather than the command acknowledgement, and ignores a late Stop error after completion. Cancellation is global in the existing backend API: S41/S42 must maintain one global run owner. `dispose()` only detaches subscriptions and ignores late responses; it deliberately sends no global Stop that could affect another project.

Validation (2026-11-03): 33 focused S32 tests and the complete 104-test frontend script union pass. Scoped strict TypeScript including all S32 tests, Biome across all 12 new files, production frontend build, and staged diff integrity checks pass. The fresh pre-S32 baseline also passed all 72 Rust script tests and the production WebDriver exclusion check. Broad TypeScript retains the 19 known baseline errors. Native IPC/picking, mounted workspace, WDIO, and packaged webview behavior remain Wave 5 checks.

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

Readiness decision (2026-11-03): S00–S32 provide the reviewed foundations; no prerequisite blocker was identified for starting S40. Wave 5 must implement the adapters below; they are not already supplied by the leaves. Verify the accepted S32 commit and frontend union in the handoff before dispatch. Review, validate, and commit each integration task before starting the next. Use [wave-5-handoff.md](./wave-5-handoff.md) for the integration constraints and next-orchestrator prompt.

### S40 — Backend application integration

Objective: register the script service and commands in Tauri and integrate shutdown and the custom protocol.

Scope:

- Manage both `ProjectStore` and one global `ImageScriptService` in application setup, independently of a connected Projects database.
- Select and validate the fixed prepared development / bundled production Bun path using the existing `bun_probe` helpers. Missing or incompatible Bun must produce an actionable error.
- Register project/run/trust commands; route editor saves through `save_trusted_script_project`, preserving session-local approval without granting new trust.
- Implement a backend-owned native input picker and approval-token issuance/revocation lifecycle. Return only `SelectedInput` contract fields to the frontend; never expose a command that approves an arbitrary frontend-provided filesystem path. Add the real Draw Things `InputResources` adapter using existing resource-handle patterns; unavailable Projects resources must not block local-file use.
- Choose and document the typed, ordered event transport consumed by S32/S41. Install frontend subscriptions before run submission. Preserve identity on every event, including pre-acknowledgement queued/terminal events.
- Map runtime locations through the exact retained source map before emitting source locations. Preserve bounded raw failures separately; never label instrumented coordinates as editor coordinates. If mapping fails or points into runner/package internals, show a location-free diagnostic rather than an incorrect Monaco marker.
- Route `dtm://script-output` before acquiring the `dtproject` service/protocol. Run the blocking responder on a blocking worker and preserve response leases.
- Await service shutdown and process joins before bookmark/shared-temp cleanup; close run admission during shutdown.
- Add only the minimum capabilities required by the frontend command surface.
- Preserve the production security baseline from S03.

Owned shared files:

- `src-tauri/src/lib.rs`
- required `src-tauri/capabilities/*.json`
- script-related Tauri configuration
- focused `src-tauri/src/script/**` integration adapters, diagnostic mapping, commands, and tests
- minimal existing resource-service access needed by the Draw Things adapter

Exit criteria:

- Backend integration tests and `cargo check --locked` pass.
- Projects need not be connected to create/open a script project.
- Native approved local input, typed events, trust-aware save/run, and opaque preview routing work without Projects connected; resource input uses the real resolver when connected.
- Source-map regression tests cover shifted instrumentation, Unicode offsets, unmappable frames, and stale run identity.
- Shutdown joins the active/pending run before shared cleanup, and existing `dtproject` routing still works.
- No frontend command can spawn an arbitrary executable.

### S41 — Frontend workspace integration

Objective: compose the frontend leaves into the new Image Scripts view.

Scope:

- Add the lazy navigation entry.
- Compose project selector, Monaco editor, generated-control inspector, run state, diagnostics, logs, and preview.
- Implement the analyzer Worker entry and `EditorAnalysisClient` transport with unique request correlation, error handling, and disposal. Equal revision numbers from different projects are not request identity. Keep compiler analysis off the UI thread.
- Retain each accepted analysis result with its exact source/revision outside Valtio; S31 exposes runtime values/inputs but deliberately does not retain instrumented source/maps. Build immutable `RunRequest` snapshots only from matching analysis and control state.
- Adapt S32 to S40's real commands/event transport and S31's native input selector. Subscribe before submission and release subscriptions/providers/workers in the correct ownership order.
- Present analyzer/TypeScript/runtime problems distinctly and map valid source locations into the existing marker owners; do not attach stale diagnostics to a new model.
- Follow DTM's Valtio `snap`/mutable-state conventions.
- Add stateful mock-Tauri support for project persistence, trust, input selection, typed ordered events, cancellation, and usable opaque preview responses. Existing mock event methods are logging stubs and do not deliver events.
- Respect S30's failed-save recovery: awaited disposal can reject and retains models for retry. Do not discard the workspace/editor after a failed flush.
- Keep layout usable at DTM's minimum window size.

Owned shared files:

- `src/views.tsx`
- narrowly required application/navigation files
- `src/mocks/**` additions for script commands
- `src/script/workspace/**`, focused analyzer-worker/editor adapters, and tests

Exit criteria:

- Web mock mode can exercise the whole view without Bun.
- Production frontend build passes.
- Opening the view never auto-runs a project.
- Manual create/edit/save/analyze/select/trust/run/stop/preview/error flows work, with source diagnostics mapped only to their originating model/revision.
- Worker transport tests cover out-of-order replies, identical revisions across projects, worker errors, and teardown; workspace tests cover failed-save navigation/unmount recovery.

### S42 — Live execution, debounce, and race hardening

Objective: turn the manual vertical slice into the live scripting MVP.

Scope:

- Analyze after a short editor debounce.
- Schedule source runs only after valid matching analysis, complete required inputs, and no control validation errors. S31 retains the last valid numeric runtime value while an incomplete numeric draft is visibly invalid; that value alone does not establish readiness.
- Debounce parameter changes separately and run immediately on slider commit.
- Cancel the old process only when a valid replacement is accepted.
- Track source, value, and input revisions independently.
- Ignore all stale analyzer and backend events.
- Keep a visible manual-run/live-run toggle.
- Coordinate one global run owner. `cancel_script` currently takes no run identity; a detached/old project's Stop must never cancel a newer project's run. If a narrower cancellation contract is required, review/update both sides explicitly.
- Serialize save/trust/run admission around the exact captured snapshot. Restoration must never grant trust or auto-run; backend trust starts empty on app restart, and external persisted edits revoke it. Do not treat frontend approval state as authoritative backend trust.

Primary paths:

- `src/script/workspace/**`
- focused changes to existing script feature modules

Required tests:

- Rapid typing produces one final run.
- Invalid intermediate text does not clear controls or kill the last run prematurely.
- Rapid slider changes cannot publish an obsolete preview.
- Switching projects cancels or detaches correctly.
- A late success after cancellation is ignored.
- A terminal event before the command acknowledgement, a rejected admission after a terminal event, and duplicate diagnostic/failed payloads cannot regress state or duplicate problems.
- Incomplete numeric drafts block replacement scheduling while retaining the last valid controls/run/preview.
- Project switching during trust, admission, input selection, or Stop cannot affect the new project's lifecycle; current versus stale previews track all three revisions.

### S43 — MVP end-to-end validation and release gate

Objective: validate the integrated dependency-free feature rather than add new capabilities.

Scope:

- Add focused WDIO coverage for create, persist, analyze, select input, trust, run, preview, error, cancellation, and reload behavior.
- Add a real Bun integration test using a small checked-in image fixture or existing prepared fixture.
- Exercise output limits, path validation, and shutdown cleanup.
- Validate a release-config build with WebDriver disabled.
- Prepare checksum-pinned Bun before fresh E2E and release builds. Add `scripts/prepare-bun.sh host` to the PR E2E workflow and universal preparation to the universal macOS release workflow before Tauri builds. Verify the prepared executable/version before real-Bun acceptance: existing tests can return early when the executable is absent.
- Update user-facing and developer documentation.
- Fix only defects discovered within the MVP scope.

Owned shared files:

- focused WDIO specs/fixtures and narrowly required shared WDIO configuration
- `.github/workflows/pr-e2e.yml` and `.github/workflows/release.yml` for Bun preparation and feature gates
- script user/developer documentation and focused MVP defect repairs

Exit criteria:

- All narrow unit/integration suites pass.
- The relevant frontend build, Rust check/tests, and WDIO spec pass.
- macOS packaged-app Bun and WebKit behavior is validated locally if Cloud cannot perform signing/UI checks.
- Packaged Monaco/analyzer workers, opaque preview protocol, native picker, and Bun cancellation are exercised in the actual webview. Universal slices, signing/notarization, and Intel/Apple Silicon launch evidence are recorded separately from host-only checks, as required by [bun-packaging.md](./bun-packaging.md).
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

