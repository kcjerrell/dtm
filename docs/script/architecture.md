# Image scripting architecture

Status: planned

Target branch: `origin/scripts`

Implementation roots:

- Frontend: `src/script/`
- Backend and bundled runner resources: `src-tauri/src/script/`

## Objective

Add an image scripting workspace in which users edit JavaScript or TypeScript, configure controls inferred from `dtm.input()` and `dtm.param()` calls, and see the result of a cancellable Bun execution as a live image preview.

The design must support package dependencies such as Sharp later without requiring a new persistence model, execution protocol, or editor architecture.

## MVP boundary

The MVP includes:

- One app-managed, single-file TypeScript entry point per script project.
- Monaco editing with DTM framework types, syntax diagnostics, completion, and custom runtime inlay hints.
- TypeScript-AST discovery of direct DTM API calls.
- Image, number, boolean, and text controls generated from statically analyzable calls.
- Persisted source and project metadata.
- Trusted, dependency-free Bun execution in a separate process.
- Local-file and Draw Things image inputs materialized into a run directory.
- File-backed output preview, logs, diagnostics, timeouts, cancellation, and restart.
- Last-successful-preview behavior when a later run fails.

The MVP does not include:

- Arbitrary npm packages or Sharp.
- Multi-file authoring.
- An extension marketplace or script sharing service.
- Unattended execution of imported scripts.
- A claim that Bun scripts are sandboxed.
- OS-level filesystem or network isolation.

Package management, Sharp, multi-file projects, and stronger isolation are post-MVP milestones.

## Component boundary

```text
Monaco model
    |
    +-- TypeScript language worker -- diagnostics/completion/DTM types
    |
    +-- DTM analyzer worker -------- controls, source ranges,
                                     instrumented source + source map
                                              |
Generated-control state ----------------------+
Input selections -----------------------------+
                                              v
                                    Rust ImageScriptService
                                     +-- project persistence
                                     +-- immutable run snapshot
                                     +-- input materialization
                                     +-- Bun process supervisor
                                     +-- cancellation/timeout
                                     +-- output registry
                                              |
                                       bundled Bun runner
                                              |
                              run directory + result manifest
                                              |
                            dtm://script-output/<opaque token>
                                              |
                                        live preview
```

The webview owns editing, analysis, controls, and presentation. Rust owns files, process lifetime, trust enforcement, input staging, output validation, and preview authorization. User source must never execute in the DTM webview.

## Frontend structure

The frontend should be organized by responsibility rather than as one large feature component:

```text
src/script/
    contracts/       Shared frontend protocol and domain types
    analysis/        TypeScript AST analysis and worker client
    editor/          Monaco setup, model lifecycle, DTM declarations
    project/         Project list, load/save controller, autosave
    controls/        Generated control components and value reconciliation
    run/             Tauri client, run generations, logs and diagnostics
    preview/         Inline preview and last-good-output behavior
    workspace/       Composition root for the Image Scripts view
```

Use Valtio for renderable feature state. Keep Monaco models, debounce timers, request generations, active-run handles, and other non-rendering coordination state outside snapshots. Source text should remain in the Monaco model and be persisted by the project controller rather than copied into a save-on-change Valtio store.

## Backend structure

```text
src-tauri/src/script/
    mod.rs
    types.rs          Serde wire types and persisted manifests
    paths.rs          Validated app-data and run-directory paths
    project_store.rs  Atomic project persistence
    input.rs          Input selection and materialization
    output.rs         Output validation and opaque token registry
    executor.rs       Process-executor abstraction and fake executor
    bun.rs            Pinned Bun process implementation
    service.rs        Run state, trust, cancellation and event delivery
    commands.rs       Narrow Tauri command surface
    protocol.rs       dtm://script-output responder
    runtime/
        runner.ts     DTM runtime loaded by the pinned Bun binary
```

`ImageScriptService` is independent of `DTPService`. It may use `ResourceHandle` adapters for Draw Things input, but it must also work when the Projects database is not connected.

## Static analysis contract

Use the TypeScript compiler AST, not regular expressions. Initially recognize only:

- One direct `createImageProcess(async (dtm) => { ... })` registration.
- Calls whose receiver resolves to that callback parameter.
- `dtm.input(...)` and `dtm.param(...)` calls with supported static arguments.

Each call produces a descriptor containing a stable ID, kind, inferred or explicit label, source ranges, default value, and constraints. An explicit `id` is authoritative. Without one, infer identity from the nearest variable declarator, call kind, syntax path, and occurrence.

The canonical constrained-number form is:

```ts
dtm.param(0, {
    id: "strength",
    label: "Strength",
    min: -1,
    max: 1,
    step: 0.1,
})
```

The positional `dtm.param(0, -1, 1, 0.1)` form may remain as a convenience overload.

Runtime lookup requires an instrumented copy of the source. Conceptually, the analyzer changes:

```ts
dtm.param(0)
```

into:

```ts
dtm.__param("generated-control-id", 0)
```

The editor source is not modified. The analyzer emits a source map so Bun locations can be mapped back to the Monaco model. Analyzer results carry the model version that produced them; stale results are discarded.

## Parameter state

Keep these separate:

- Source schema: call ID, kind, label, default, constraints, and source range.
- Runtime state: selected value, whether the user changed it, and selected input metadata.
- Run snapshot: immutable source, inputs, and parameter values for one run.

For a compatible control whose ID remains present, preserve a user-selected value. Untouched values follow source-default edits. Type changes reset the value. Constraint changes validate or clamp visibly. Inlay hints display the runtime value without modifying source.

## Persistence

App-managed projects live under an image-scripts app-data directory:

```text
image-scripts/projects/<uuid>/
    dtm.json
    process.ts
    package.json       # post-MVP
    bun.lock           # post-MVP
    node_modules/      # generated; never exported
```

`dtm.json` contains portable, versioned metadata such as project ID, display name, schema version, and entry filename. Trust decisions, recent-project state, private paths, selected inputs, parameter values, and editor view state stay in DTM-local metadata and are not exported with the script.

Backend writes are atomic. Runs use an immutable source snapshot identified by revision and content hash; they do not read a file that autosave might currently be replacing.

## Execution and transport

Bundle a pinned Bun binary with DTM. The build must use checksum-pinned preparation and platform-specific Tauri sidecar artifacts. The runner version and Bun version are part of run diagnostics.

Each run receives a manifest rather than command-line source or image bytes. The runner registers the global `createImageProcess`, imports the instrumented entry module, verifies that exactly one process was registered, creates the runtime `dtm` object, executes the callback, and writes an atomic result manifest.

Standard output and error are capped logs, not a trusted protocol. User code can write arbitrary data to them. Structured success data is accepted only from the result manifest in the run directory.

Images are transported through files:

- Local input is copied into the run directory; do not hard-link it.
- Draw Things input is materialized through a `ResourceHandle` adapter.
- Returned bytes or paths are normalized into the run output directory.
- Rust canonicalizes and validates the output path, file size, and media type.
- The frontend receives metadata and an opaque `dtm://script-output/<token>` URL, never a full image in JSON.

The initial image result contract supports a staged input, a typed byte buffer, or a validated path. Sharp-specific normalization is deferred until package support.

## Run lifecycle

A run is identified by project ID, backend run ID, client request ID, source revision, value revision, and input revision. The frontend ignores events that do not match its current desired snapshot.

The initial scheduler permits one active script process globally. A new valid run cancels the previous run. Invalid or incomplete source does not cancel the last valid run until a replacement is actually ready to start.

Cancellation is backend-owned. Start Bun in a separate process group, request graceful termination, then kill the process group after a short deadline. Apply default time, log-size, and output-size limits. App shutdown stops the script service before deleting temporary files.

Keep the last successful preview visible while a new run is pending and when a later run fails. Mark it as stale with the revision that produced it.

## Diagnostics

Keep diagnostic sources distinct:

- Monaco TypeScript syntax and semantic diagnostics.
- DTM analyzer diagnostics.
- Bun import or compilation errors.
- User runtime exceptions.
- Runner protocol or output-validation failures.
- Timeout, cancellation, and forced termination.
- Dependency installation diagnostics after the MVP.

Syntax and analyzer errors block a run. Ordinary TypeScript semantic errors are visible but need not block execution because Bun normally transpiles TypeScript without performing a full typecheck. Runtime locations are mapped through the generated source map when possible; raw stderr remains available when mapping fails.

## Security model

Bun is not a security sandbox. Scripts may use filesystem, networking, subprocess, native-addon, and FFI APIs available to the user account. The MVP is therefore explicitly for trusted local scripts.

Required controls before the first executable milestone:

- Never execute source in the webview.
- Imported or externally changed projects start untrusted.
- Never auto-run an untrusted project on open.
- Require an explicit first-run warning.
- Enable live execution only for a trusted project.
- Keep Bun spawning in Rust; do not add a frontend Bun shell capability.
- Start with a minimal environment and run-specific working directory.
- Validate output containment and enforce resource caps.
- Make dependency installation a separate future trust action.
- Gate the existing WDIO/WebDriver plugins out of production builds before shipping scripts.

OS-level sandboxing or a capability-broker helper is a later security project. Environment filtering and temporary directories must not be described as isolation.

## Post-MVP direction

Package support adds per-project `package.json`, `bun.lock`, explicit dependency installation, frozen-lock restoration, package declaration files for the editor, and explicit lifecycle-script trust. Sharp is the first native-package acceptance target. Multi-file source support follows the existing project directory and snapshot model.

