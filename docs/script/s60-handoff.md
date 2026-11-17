# S60 stronger isolation handoff

## Starting point

Resume from local `scripts` at `f329f94d93550469f1e46a99a3520d81302df759`. The checkout was clean when this handoff began. Its local `origin/scripts` tracking ref was `80ba4bb93a126295c68113706507e9aaac5ada8a`. A remote worker needs a published ref containing the S50–S52 commits.

| Task | Commit | Delivered |
| --- | --- | --- |
| S50 | `e6982353` | Locked package installs and restores, installation cancellation, and separate lifecycle-hook approval |
| S51 | `c688430d` | Package controls, revision-specific editor declarations, and script trust tied to the installed generation |
| S52 | `f329f94d` | Sharp pipelines written to managed PNG or JPEG files, decoded output metadata, and a resize template |

S52 passed 92 Rust scripting tests, 122 frontend scripting tests, and the three Apple Silicon WebKit tests. The real Sharp case verified native install, a decoded JPEG preview, and Stop preserving the previous preview. Apple Silicon frozen restore preserved the lockfile byte for byte. See the [S52 acceptance record](./implementation-plan.md#s52--sharp-acceptance) for the memory measurements.

Use Apple Silicon macOS for hands-on validation. Intel and Linux runtime testing were deferred. Developer ID signing and notarization remain open distribution checks. Keep those results distinct from local isolation probes.

## Assignment

Investigate whether a separately supervised Bun helper, a capability broker, or a combination can enforce an explicit filesystem, network, and process policy for future Image Scripts execution. Deliver a recommendation supported by evidence and a narrow implementation brief for the next step. The existing product supports trusted local scripts. Use its current behavior and release workflow as the compatibility baseline.

Read [AGENTS.md](../../AGENTS.md), the [architecture and security model](./architecture.md#security-model), [pinned Bun packaging policy](./bun-packaging.md), and these implementation paths:

- [`app.rs`](../../src-tauri/src/script/app.rs), [`service.rs`](../../src-tauri/src/script/service.rs), and [`bun.rs`](../../src-tauri/src/script/bun.rs) for composition, admission, process launch, cancellation, and shutdown.
- [`input.rs`](../../src-tauri/src/script/input.rs), [`output.rs`](../../src-tauri/src/script/output.rs), and [`runtime/runner.ts`](../../src-tauri/src/script/runtime/runner.ts) for the file broker boundary and result validation.
- [`service/packages.rs`](../../src-tauri/src/script/service/packages.rs) and [`packages.rs`](../../src-tauri/src/script/packages.rs) for dependency installation, package leases, and lifecycle-hook approval. Treat installation and approved hooks as a separate execution surface from running a script.

Today Rust checks the saved source and selected package revision, stages approved inputs, starts pinned Bun with a reduced environment and an owned process group, and validates output before serving an opaque preview URL. A trusted script still has the user account's access through Bun, including native modules. Sharp adds an installed native addon and shared libraries to the runtime compatibility requirements.

## Evidence to collect

Start with a threat model and compare the two mechanisms against the same policy. Identify which boundaries the OS enforces, which require a broker check, and which remain open. Consult current primary documentation for OS mechanisms and signing requirements. Record the OS version, Bun version, and signing state for any hands-on result.

| Boundary | Expected behavior to assess |
| --- | --- |
| Filesystem | Read staged inputs and the selected package generation. Write within the run's output and scratch area. Deny access to an unrelated fixture outside those paths, including access through a symlink. |
| Network | Deny a run's outbound connection to a controlled test endpoint. Explain how explicit package installation reaches the registry and how install hooks are handled separately. |
| Process lifetime | Determine what prevents or contains child processes and what Stop and app shutdown do to descendants, including a child that attempts to detach. |
| Broker authority | Bind requests to the active run and its staged files. Reject stale identities, arbitrary paths, and out-of-scope output. Assess inherited file descriptors and reachable OS services. |
| Existing workflow | Check local and indexed input staging, packaged Bun, loading installed Sharp libraries, a decoded preview, and keeping the last successful preview after a failed or cancelled run. |

Use disposable scratch files, a controlled endpoint, and synthetic child processes for denial probes. A probe may be throwaway. Separate observed behavior from design assumptions, especially local ad hoc execution versus a signed distribution build. An inconclusive or failed probe is a useful result if it identifies the missing evidence or blocker.

## Handoff back

Write the findings in `docs/script/s60-isolation-investigation.md`. Include the recommendation, authority and data-flow boundaries, the allow/deny matrix, reproducible commands and observed results, compatibility and distribution implications, and the smallest implementation step with acceptance tests. State explicitly whether any candidate has demonstrated an enforceable policy for all three boundaries. Keep experimental code in scratch space for this investigation. Bring back a proposal before changing production launch, signing, Tauri capabilities, contracts, or package behavior.
