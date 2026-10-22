# AGENTS.md

## Project

DTM is a Tauri v2 desktop companion for Draw Things, primarily targeting macOS.

- Frontend: React, TypeScript, Vite, Chakra UI / Ark UI, Valtio
- Backend: Rust, Tokio, SQLite, SeaORM / sqlx
- E2E: WebdriverIO + Mocha
- `src/` contains the frontend.
- `src-tauri/` contains the Rust backend.

DTM has two primary tools:

- **Metadata** — inspect and work with metadata from Draw Things images.
- **Projects** — index Draw Things project files for fast browsing, searching, and inspection.

Real-world libraries may contain tens of thousands of images and 100+ GB of project data. Consider performance and memory use when working on indexing, image loading, or database code.

## General guidelines

- Read the surrounding implementation and search for existing abstractions before adding new ones.
- Keep changes focused. Do not include unrelated cleanup unless requested.
- Search for callers before changing an existing API.
- Prefer existing architectural and UI patterns over introducing parallel abstractions.
- For bug fixes, add a regression test when practical.
- Do not silently change behavior while refactoring.
- Do not use arbitrary sleeps for synchronization.
- Avoid `unwrap()` / `expect()` for external files, database contents, user input, or other fallible data.
- Preserve underlying errors and add useful `anyhow` context at abstraction boundaries.
- Do not add dependencies when existing dependencies or straightforward code are sufficient.

## Draw Things data

Draw Things project files are SQLite databases whose internal schema is not a normal application-facing API.

Important tables include:

- `tensorhistorynode`
- `tensordata`
- `tensormoodboarddata`
- `thumbnailhistorynode`
- `thumbnailhistorynodehalf`
- `tensors`
- `texthistorynode`

For tensor history:

- `__pk0` = lineage
- `__pk1` = logical time
- `__pk2` = index

Much of DTM's interpretation of Draw Things data has been derived empirically.

**Do not infer semantics from Draw Things field names or simplify existing parsing/history logic without first understanding why it exists.** Existing code, tests, and fixtures are more authoritative than assumptions about how Draw Things should behave.

Unknown or newer Draw Things values should generally degrade gracefully rather than making an entire project unindexable.

## History reconstruction

History/parent reconstruction is particularly subtle and has been reverse-engineered from observed Draw Things behavior.

A parent may legitimately be:

- unknown
- nonexistent
- uniquely identified
- ambiguous between multiple nodes

Never replace ambiguity with a heuristic that simply chooses one candidate.

Before modifying history reconstruction, read the module's tests and documentation carefully. Preserve established invariants unless the task explicitly requires changing them.

## Projects database and indexing

The DTM Projects database is an index separate from the Draw Things databases being scanned.

Indexing must scale to large libraries.

Avoid:

- reopening project databases unnecessarily
- per-row transactions where batching is possible
- unnecessary full-image decoding
- retaining large image buffers
- unnecessary FTS rebuilds
- unbounded task spawning
- N+1 queries in hot paths

Full and incremental scans have different purposes; preserve that distinction.

File watcher events may be redundant or arrive in bursts. Existing coalescing/debouncing is intentional.

Treat persisted enum numeric values and database schema as compatibility-sensitive.

## Rust

Use the existing `anyhow::Result` conventions.

Prefer preserving the source error:

```rust
operation()
    .await
    .with_context(|| format!("failed to process {}", path.display()))?;
```

rather than replacing it with a new error.

Add context that identifies what DTM was doing and the relevant project/file/item. Avoid context that merely repeats the underlying error.

Be deliberate about spawned tasks, worker lifetime, channel ownership, and shutdown. Do not hold locks across `.await` without a specific reason.

Use `Path` / `PathBuf` for filesystem paths. Do not assume the working directory or hardcode developer-machine paths.

## Frontend

Follow existing React, Chakra/Ark, and Valtio patterns.

Preserve accessibility semantics. Prefer correct roles and accessible names rather than adding ARIA solely for test selectors.

For E2E selectors, prefer:

1. accessible role/name
2. stable test IDs/data attributes
3. other stable semantic attributes

Avoid generated CSS classes, DOM position, and Chakra implementation details.

Wait for actual UI state changes instead of fixed sleeps.

## Validation

Run the narrowest relevant tests while developing, then broader validation before finishing.

Use the repository's existing scripts/configuration as the authority for exact commands.

The generated Tauri icons under `src-tauri/icons/` are intentionally not tracked. In a fresh
checkout or worktree, run `npm run gen-icons` from the repository root before building the app or
running Cargo commands that compile `tauri::generate_context!()` (including `cargo test`).

The test fixtures are also intentionally not tracked. In a fresh checkout or worktree, run
`./test-setup.sh` from `src-tauri/` before running `cargo test`; the Rust integration tests resolve
their fixtures relative to that directory. Run `./scripts/test-setup.sh` from the repository root
before the end-to-end test suite; that script prepares the root project and ffmpeg fixtures.

Depending on the affected code, validate:

- Rust formatting/check/tests
- TypeScript type checking/linting
- relevant WDIO tests

Do not consider a task complete merely because the code compiles; test the behavior that was changed.

## When something looks unnecessarily complicated

Before simplifying it, determine whether the complexity exists because of:

- reverse-engineered Draw Things behavior
- backward compatibility
- malformed/partial project handling
- history ambiguity
- concurrency/lifetime requirements
- large-library performance
- Tauri/macOS behavior

If a requested change conflicts with one of these constraints, identify the conflict rather than silently removing the constraint.
