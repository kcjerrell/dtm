# Pinned Bun packaging policy

DTM pins **Bun 1.4.3**. `scripts/prepare-bun.sh` records the upstream GitHub release URL and SHA-256 for each supported upstream archive. It downloads with `curl`, verifies the archive before extraction, fails closed with the artifact and target in the error, extracts into a temporary directory, installs atomically, and validates `bun --version` exactly.

Run `scripts/prepare-bun.sh host` before a local Tauri build, or pass one of these target triples:

- `x86_64-unknown-linux-gnu`
- `aarch64-unknown-linux-gnu`
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`

Prepared executables are deliberately ignored and are named `src-tauri/binaries/bun-<target-triple>`. Tauri's `bundle.externalBin` entry is `binaries/bun`; Tauri selects the target-suffixed input and installs it as the fixed `bun` sidecar beside DTM. This adds roughly one uncompressed Bun executable per platform to release artifacts (the upstream archives are approximately 29–42 MB). It is not downloaded at application runtime.

For a universal macOS build, run `scripts/prepare-bun.sh universal-apple-darwin` on macOS. The script checksum-validates both architecture archives independently, combines only their Bun executables with Apple's `lipo`, validates the universal executable's version, and writes `bun-universal-apple-darwin`. Release automation must run this step before the Tauri universal build.

The Bun sidecar must be included in the app's recursive code-signing and notarization submission. Release validation must inspect both slices (`lipo -archs`), verify the hardened-runtime signature (`codesign --verify --deep --strict`), notarize/staple the app or DMG, and launch the packaged app on both Apple Silicon and Intel (or an Intel CI/host). Cloud Linux validation does not satisfy these macOS gates.

Rust starts Bun directly at a fixed path with fixed probe arguments; it never invokes a shell to launch Bun. The viability module is not a Tauri command and the configuration adds no shell capability, so the webview cannot execute Bun. The probe contains no user-script entry point. Cancellation gives the dedicated process group `SIGTERM`, waits for a bounded deadline, and then sends `SIGKILL` to the full group.
