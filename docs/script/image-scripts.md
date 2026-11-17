# Image Scripts

Open **Image Scripts** in DTM and create a project. DTM keeps the TypeScript file in its app data directory and saves changes as you edit. A local image workflow works without a connected Projects library.

Paste this script to try the workspace.

```ts
createImageProcess(async (dtm) => {
    const image = await dtm.input({ id: "source", label: "Source image" })
    const label = dtm.param("Preview", { id: "label", label: "Log label" })
    console.log(label)
    return image
})
```

1. In **Source image**, choose a local PNG or JPEG. To use an indexed image, connect your library in **Projects**, then use **Load recent Draw Things images**, select an image, and click **Choose image**.
2. Review the script and acknowledge the trust warning, then click **Trust this script**.
3. Click **Run**. The workspace displays the output image, logs, and any problems. Click **Stop** to cancel a running script.
4. Turn on **Live run** if you want valid edits and control changes to update the preview automatically. A failed run leaves the previous successful preview visible. Opening a project never starts a run. Switching projects or stopping the current script turns off Live.

The editor generates controls for supported static calls to `dtm.input()` and `dtm.param()`. Parameters can be numbers, booleans, or text. Adding `min`, `max`, and `step` to a number creates a slider. A script returns an image input, a path to a PNG or JPEG, or image bytes in a `Uint8Array`.

**Run only code you trust.** DTM runs scripts using your account's filesystem, network, and process access. Bun does not provide a sandbox. DTM requires explicit approval before execution, and backend approval ends when DTM quits. Input selections stay local to the workspace. Run time, log size, and output image size are limited.

## Packages

Open **Packages** to install an npm package by name and exact version. DTM pins the resolved versions in the project's lockfile, and the editor loads declaration files from the installed packages. Imports execute through Bun after you review and trust the script with its current dependencies.

Restore reinstalls the versions from the current lockfile. DTM skips install hooks by default. You can explicitly approve hooks for selected dependency names during a restore. Approval covers every locked occurrence of a selected name and applies to that restore only. A package change turns off Live run and requires fresh script approval.

## Development checks

From the repository root, prepare the pinned Bun sidecar before building Tauri:

```sh
npm ci
npm run gen-icons
scripts/prepare-bun.sh host
sh scripts/test-setup.sh
(cd src-tauri && ./test-setup.sh && cargo test --locked --lib script::)
npm run build:e2e
npm run wdio -- --spec test/specs/image-scripts.e2e.ts
```

Use an isolated app data directory or bundle identifier for WDIO. The spec adds its own indexed fixture folder and creates a uniquely named script project. The fixture exercises real Bun, Monaco, and the opaque preview protocol in the WebView. Native local-file selection is a separate interactive check.

With npm registry access, run `DTM_TEST_SCRIPT_REGISTRY=1 npm run wdio -- --spec test/specs/image-scripts.e2e.ts` to also exercise package installation, typed subpath imports, frozen restore, and removal in the WebView.

Run `npm run dev:web` to exercise the workspace in a browser with mock IPC. The mock simulates execution and never evaluates editor source in the web page.

For universal builds and distribution checks, see the [pinned Bun packaging policy](./bun-packaging.md).
