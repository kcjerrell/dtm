# Wave 2 handoff

Wave 2 implements the four independent scripting cores. Application service,
trust enforcement, input/output adapters, navigation, and live execution remain
owned by later waves. Wave 3 has not started.

## Provenance

All tasks started from `scripts` at
`3f5b8090d974f08ec675a6142f2b68fee6167627` in the dtm2 Cloud environment
`6a9590c0f19c8191b2e2648082d02b57`. Implementation and substantive repairs ran
in Cloud; review, integration, and macOS validation ran in the existing local
checkout without a worktree.

| Task | Cloud task | Local integration commits |
| --- | --- | --- |
| S10 analyzer | [Cloud](https://chatgpt.com/codex/tasks/task_e_6ad0365983ec8328b34d298b9095bccb) | `b3b0c94`, `c395044` |
| S11 persistence | [Cloud](https://chatgpt.com/codex/tasks/task_e_6ad0365f97988328b4a0ff7bb4f385a1) | `0507eb5` |
| S12 editor | [Cloud](https://chatgpt.com/codex/tasks/task_e_6ad036662f0c83288f5789906908ef31) | `97df59d`, `8538d28` |
| S13 runner | [Cloud](https://chatgpt.com/codex/tasks/task_e_6ad0366b70508328aebcd8e0daac2eb6) | `465d4b3` |

Cloud follow-ups sometimes materialized equivalent squashed parent commits.
The actual cumulative diffs were reviewed before local application.

- S10: initial `d62ea25b948e624ee495c48948a804530b1a29e2`, overflow/source-map
  repair `72039d344a16d8f336b67aa1c22904554acbbe3f`, omitted-step normalization
  `982509bd10d7e2f5b554959d5210566bcb5d07c9` (materialized parent
  `9f85c121ab6627aec244a369c4bb5360d02aa76f`).
- S11: materialized original `80e138830f2c61bc2d56a5ddb520271fcfe32d20`,
  containment repair `6e7d4e3959903ba4073842e0733fbd46a6218cb6`.
- S12: materialized parent `0ca1860b2611964163ead56fdc28b07074337fcc`,
  Monaco API repair `a767f75890f32a05336c3cb189d87999198d8da1`.
- S13: materialized parent `82675350e417c149d31ac47e71c74a551426d04a`,
  termination/FIFO repair `49b0992e07a1f3c78680e2c2c4a7d30ad2a06e9e`,
  preparation seam `699da4a738e730e3c5a3a6a2eb7214a97e3b9f66`.

## Integration decisions

The user approved one dependency exception: the exact development alias
`typescript-compiler-api: npm:typescript@6.0.3`. TypeScript 7.0.2 remains the
project toolchain. Its root package has no JavaScript compiler AST API. A clean
`npm ci --ignore-scripts --legacy-peer-deps` retained the TypeScript 7 `tsc`
shim. Focused checks explicitly invoke `node node_modules/typescript/bin/tsc`.

Frozen Wave 0 contracts, the WDIO feature gate and plugin ordering, and the Bun
host-target mapping are unchanged. Shared Rust module declarations retain the
union of storage and runner modules.

Small local integration adjustments were limited to:

- Canonicalizing a macOS temporary path in a runner test assertion.
- Registering Monaco's modular JavaScript/TypeScript language definitions.
- Reusing S10 analysis request/response types at the editor worker-client boundary.
- Adapting the real-model JSDOM test to its missing media-query/Worker facilities;
  native browser worker behavior was checked separately.

## Boundaries for later integration

Use `createScriptModelRegistry()` from `src/script/editor/monacoApi.ts` to obtain
the supported modular Monaco setup. Project models retain source, undo history,
revision, diagnostics, providers, and disposal ownership. `ScriptEditorSession`
retains per-project view state. Analyzer responses can omit runnable source on
invalid input; the last-valid-analysis policy belongs to the future controller.

Use `ScriptExecutor::prepare(request)` to create an opaque single-use
`PreparedExecution`. Inspect its immutable `manifest()`, stage approved input
bytes at `staged_input_path(input_id)`, then consume it with
`execute_prepared(prepared, cancellation)`. Dropping an unstarted preparation
cleans its directory. After spawn, the service owns run-directory/output
retention; the executor owns process-group cleanup. `execute` is a convenience
for runs without a separate staging step.

`ProjectStore` takes an injected app-data root and keeps portable projects under
`image-scripts/projects/<uuid>` and private state under a separate root. CRUD
validates managed directory containment, manifest versions/identity, and entry
filenames. Project command wrappers are compiled but await application wiring.

## Validation

Passed locally after integration:

- 28 frontend tests across analyzer, contracts, editor lifecycle, and real Monaco models.
- 33 Rust script library tests, including actual pinned Bun 1.4.3 on Apple Silicon.
- Focused strict TypeScript 7 checks and Biome for all analyzer/editor modules.
- `npm run build` and a separate browser validation bundle including the new cores.
- Native browser Worker analysis and a real Monaco browser check covering
  project switching, undo/view state, declaration-worker diagnostics, stable
  models, stale-handle protection, and disposal.
- `cargo check --locked`, `cargo fmt --all -- --check`,
  `npm run check:wdio-security`, and Git diff integrity checks.

Repository-wide TypeScript checking still has 19 pre-existing error signatures;
none are new relative to the starting snapshot. The starting snapshot had 26,
including Monaco setup errors repaired in this wave. Broad Rust integration-test
compilation has an existing `tests/search.rs` call-arity failure; focused script
library tests are independent of that failure.

## Remaining platform gates

Preserved from Wave 1:

- Monaco in a packaged WKWebView app. Browser/JSDOM checks do not establish this.
- Universal macOS Bun assembly, signing/notarization, and Intel launch validation.
- The generated DMG `bundle_dmg.sh` failure. The previous debug application
  bundle and focused WDIO smoke had succeeded; DMG packaging was not reopened.
