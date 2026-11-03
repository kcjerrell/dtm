# Wave 5 integration handoff

Review date: 2026-11-03. Companion: [implementation-plan.md](./implementation-plan.md).

## Acceptance boundary

S00–S32 are committed, reviewed foundations. S32 is accepted at `0ab7b234f5f3121dfc25593247f88735a86993d9` after implementation, independent review, orchestrator repairs, and the checks below. No S40–S43 application integration has been performed in this preparation pass. Milestones A–C are not accepted as application workflows yet.

Review starting point: local `scripts` at `87b8cc68fe3dbd91d00924248add5ccc7d6a436e`. The live remote `scripts` branch was verified at `34a318597e412ea22d7bcb14fa539c1fe7783d05`, before S20/S30/S31. Recheck the remote before dispatch: never assume a local accepted commit is available to Cloud.

Required implementation ancestor for Wave 5: `0ab7b234f5f3121dfc25593247f88735a86993d9`. Start from the published `scripts` HEAD containing that commit **and this handoff/plan update**, and record its exact SHA in every task brief. Do not reset to the review-start remote or to the old design baseline. Verify ancestry and a clean task base before dispatch.

## Existing composition boundaries

- S20: construct one `ImageScriptService` with the shared `ProjectStore`, executor, `InputApprovals`, real `InputResources`, limits, and a prompt nonblocking event sink. Register both store and service state. Use `output_registry()` for protocol routing. Await `shutdown()` before shared temp/bookmark cleanup.
- S30: `createProjectCommands(invoke)` already saves through `save_trusted_script_project`. `ScriptProjectController` owns project/autosave orchestration; source stays in stable S12 Monaco models. Await `initialize()` and `dispose()`. A failed flush/disposal leaves models available for retry; the host must not destroy them.
- S31: one `ScriptControlsController` per project model. The host schedules `analyze()`, owns the analyzer client, binds/disposes inlay hints, and supplies `selectImage({ projectId, inputId, signal })`. `runtimeSnapshot()` returns plain values, selections, and independent value/input revisions; `onDidChange` distinguishes change/commit. Numeric draft errors can coexist with a retained valid runtime value.
- S32: one `ScriptRunController` per project, with injected `createRunCommands(invoke)` and `createRunEventSource(listen, eventName)`. Compose `ScriptRunPanel`, `ScriptProblems`, `ScriptLogs`, and `ScriptPreview`. The host validates and supplies the request in `onRun`, sets `canRun`, and updates `setDesiredRevisions`. `run()` freezes before async setup and resolves on admission acknowledgement, not terminal completion. Coalesce desired replacements while `state.admitting` is true. Generate globally unique client request IDs; the replay guard retains the latest 1,024. `dispose()` detaches without sending global cancellation.
- The analysis contract is request/response only. There is no production Worker transport. Responses have source revision but no project identity: correlate requests by unique transport IDs and promise ownership, never by revision alone. Retain accepted source, instrumented source, and map outside Valtio for immutable run admission.
- Input primitives exist, but production native selection/approval and Draw Things resource adapters do not. Native selection must originate in the backend and return opaque tokens/IDs and filenames. Do not introduce an arbitrary frontend-path approval endpoint.
- Runtime failure detail retains the frozen source/map internally; current events carry location-free diagnostics. S40 must map instrumented frames before publishing source locations. S41 must apply markers only to the matching model/source revision. Keep mapping failures location-free and raw detail separate.

## Backend/event invariants

1. Subscribe before invoking `run_script`: queued/started/terminal events can precede its acknowledgement. Preparation can emit a terminal event and then reject the invocation.
2. Match project ID, client request ID, backend run ID, source revision, value revision, and input revision. Backend IDs are assigned by the service. Stale success cannot publish a current preview.
3. A failed run emits a diagnostic and then a failed event with the same diagnostic; deduplicate routine problems.
4. Valid replacement admission stages inputs and captures output authorization before cancelling the old process. Invalid analysis, incomplete controls/inputs, or failed preparation must preserve the prior valid execution/preview. Stop must still reach a surviving old process.
5. `cancel_script` is global and currently takes no identity. Keep one global run owner and coordinate project switching and delayed trust/admission/Stop replies. Disposing an old view must not cancel a new project's run.
6. Trust is session-local and backend-enforced against saved source. Opening/restoring never approves or runs. Service-owned saves preserve existing approval; external persisted changes revoke it. Save/trust/run ordering must refer to the captured snapshot.
7. Preview URLs are `dtm://script-output/<opaque token>`. Dispatch this host before accessing Projects. The responder does blocking IO; preserve its read lease and use a blocking worker. Check preview retention when switching projects and starting replacements.
8. Frontend trust is cached presentation state. S32 offers an explicit Review trust action after failure, resetting warning acknowledgement without revoking valid backend approval automatically. S41/S42 still need to invalidate/reconcile that cache on reopen/external changes or confirmed revocation. Apply Monaco markers from original source-mapped payloads before S32 strips locations for routine presentation.

## Sequential work and gates

| Task | Integration responsibility | Acceptance before advancing |
| --- | --- | --- |
| S40 | Register store/service/commands; fixed Bun path/version; backend native picker/approval and resource resolver; ordered events; runtime source-map mapping; independent protocol routing; shutdown ordering | Backend integration tests, 72-test baseline plus new regressions, `cargo check --locked`, production execution-security check; local input and project operations work with Projects disconnected |
| S41 | Lazy workspace; analyzer Worker/transport; exact analysis snapshot cache; compose S30/S31/S32; real adapters and markers; stateful mock commands/events/preview; failed-save recovery | Whole manual flow in web mock mode; worker correlation/teardown and workspace tests; frontend suite, scoped strict TypeScript, production build; opening/restoring never runs |
| S42 | Live toggle and separate source/value debounce; slider commits; readiness including numeric draft errors; one global run owner; cross-project/stale-event/trust/save races | Deterministic race tests with controlled promises/process gates; rapid typing/slider changes, invalid intermediate source, failed preparation, project switching, cancellation/late success |
| S43 | Focused WDIO and real Bun acceptance; limits/path/shutdown checks; release build; documentation; Bun preparation in CI/release workflows | Fresh fixtures/icons/Bun prepared; narrow unions + Rust/build/WDIO pass; explicit packaged macOS and distribution evidence; remaining security limits visible to users |

S40 owns focused backend adapters/mapping plus `src-tauri/src/lib.rs` and necessary capabilities/config. S41 owns workspace/worker composition, mocks, and minimal navigation changes. S42 owns live scheduling and focused cross-module repairs. S43 explicitly owns Bun preparation in `.github/workflows/pr-e2e.yml` and `.github/workflows/release.yml`; neither currently prepares the sidecar before build. Dependency/lockfile changes require an assigned reason and review; do not let leaf workers opportunistically change them.

## Validation and platform limits

Checks performed in this orchestration:

- `npx vitest run src/script --maxWorkers=1 --no-file-parallelism`: 104/104 after final S32 repairs (71/71 baseline).
- `npx vitest run src/script/run src/script/preview --maxWorkers=1 --no-file-parallelism`: 33/33 focused S32 tests.
- `npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --jsx react-jsx --allowImportingTsExtensions src/script/run/*.ts src/script/run/*.tsx src/script/preview/*.ts src/script/preview/*.tsx`: passed, including tests.
- `npx biome check src/script/run src/script/preview`: all 12 files passed.
- `npm run build`: passed (existing large-chunk warning); the application does not yet mount S32, so this is a host-build gate, not a production workspace smoke test.
- `git diff --check` and staged diff checks: passed.
- From `src-tauri/`, `cargo test --locked --lib script::`: 72/72. The prepared `binaries/bun-aarch64-apple-darwin` executable is present, so the host real-Bun tests have their required binary.
- `npm run check:wdio-security`: passed.
- `npx tsc --noEmit --pretty false`: 19 existing errors: 18 elsewhere in the app and one contract-fixture literal/brand typing error. Record scoped strict checks separately; do not claim the broad check passes or suppress unrelated errors.

Fresh checkouts require `npm run gen-icons`, `src-tauri/test-setup.sh` from `src-tauri/` before Rust integration tests, and `scripts/test-setup.sh` before WDIO. Prepare Bun using `scripts/prepare-bun.sh host`; universal builds require `scripts/prepare-bun.sh universal-apple-darwin`. Existing Bun tests can return early if the binary is absent: verify existence and version before treating them as real-runtime evidence.

No live application IPC, native picker, mounted workspace, WDIO feature flow, or packaged WKWebView behavior was established by the baseline. S43 must exercise packaged Monaco/analyzer workers, opaque protocol previews, native selection, cancellation and reload. Universal architecture slices, signing/notarization, Intel and Apple Silicon launch checks remain separate distribution gates under [bun-packaging.md](./bun-packaging.md). Host unit/web checks do not satisfy these gates. Scripts are trusted local code with account-level filesystem/network/process access; do not describe Bun as a sandbox.

## Prompt for the Wave 5 orchestrator

```text
Orchestrate Wave 5 (S40 → S41 → S42 → S43) of DTM image scripting.

Required implementation ancestor: 0ab7b234f5f3121dfc25593247f88735a86993d9.
Start from the published scripts HEAD containing it and the handoff/plan update;
record that exact starting HEAD in task briefs before any worker edits.

Read AGENTS.md, docs/script/architecture.md, the complete Wave 5 entries in
docs/script/implementation-plan.md, docs/script/wave-5-handoff.md, and
docs/script/bun-packaging.md before dispatching work. Use the final reviewed
implementation base and S32 acceptance record in this handoff. Preserve unrelated
changes and inspect status/diff before doing anything.

Preflight the local and live origin/scripts SHAs. Confirm all completed leaves
S00–S32 are present. A Cloud worker must start from an exact published SHA;
publish/verify the accepted local base first if the remote is behind. Stop and
report any mismatch or missing prerequisite instead of reconstructing prior work.
Create explicit task briefs using docs/script/codex-task-template.md with exact
base SHA, dependencies, allowed paths, frozen contracts, tests, and handoff format.
You may delegate implementation and independent review. Workers must not merge,
push, branch-switch the shared checkout, or expand scope. Use isolated branches
for Cloud workers; explicitly document any local execution override.

Proceed sequentially. Review the actual diff and changed behavior, run focused
checks plus the affected union, repair defects, and commit each accepted task
before beginning its dependent. Publish the new scripts base before later Cloud
dispatches. Do not accept a task just because its tests pass. Pause dependent work
for reviewed shared-contract changes and update the plan/briefs before continuing.

S40 must supply the missing production adapters, not just register functions:
backend-native input picker/opaque approvals/revocation, real InputResources,
fixed prepared/bundled Bun selection, ordered events, runtime source mapping,
independent script-output protocol dispatch, and awaited shutdown before cleanup.
Use save_trusted_script_project for editor saves; local input/project operations
must work without Projects connected. No frontend arbitrary-path approval or
arbitrary executable spawning capability is permitted.

S41 must implement the actual analyzer Worker transport and exact snapshot cache,
compose existing controllers in a lazy workspace, provide stateful mock IPC/events
and usable opaque previews, and preserve failed-save models for retry. Match
worker promises by request identity across projects. Subscribe to run events before
submission. Never turn raw instrumented locations into editor markers.

S42 owns all live scheduling and the global run owner. Gate replacements on valid
matching analysis, complete inputs, and no control validation errors. Coordinate
save/trust/run admission, project switches and global Stop. Preserve the running
process when replacement preparation fails; ignore stale outputs, late success,
old acknowledgements and detached-controller actions. Test pre-ack terminal events
and duplicate diagnostic/failed payloads. Opening/restoring never approves/runs.

S43 owns WDIO/real Bun/release acceptance and preparing pinned Bun before builds
in both PR E2E and universal release workflows. Verify the binary/version so
early-returning tests cannot masquerade as runtime acceptance. Exercise actual
packaged macOS workers/protocol/native picker/cancellation; distinguish those
checks from universal slices/signing/notarization/Intel launch evidence. Report
unavailable platform checks honestly and do not declare Milestone C complete
until all required S43 gates are satisfied.

Use established React/Chakra/Valtio, backend error/lifetime, and accessible-selector
patterns. Keep source/models/timers outside render snapshots. Do not add packages,
Sharp, stronger isolation, unrelated refactors, or post-MVP work. Track the existing
19 broad TypeScript diagnostics separately from feature-scoped validation.

Update the implementation plan and final handoff with exact commits, changed
paths, checks performed, baseline failures, unrun platform gates, and remaining
risks. Ask me if a real blocker requires a product or scope decision.
```
