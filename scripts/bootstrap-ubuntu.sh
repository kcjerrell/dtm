#!/usr/bin/env bash
# Prepare a supported Ubuntu 24.04 x86_64 or ARM64 development host.
set -euo pipefail

if ! grep -q '^VERSION_ID="24.04"$' /etc/os-release; then
  echo "error: this bootstrap supports Ubuntu 24.04 only" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64)
    node_arch=x64
    node_sha256=472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6
    ;;
  aarch64|arm64)
    node_arch=arm64
    node_sha256=f3d5a797b5d210ce8e2cb265544c8e482eaedcb8aa409a8b46da7e8595d0dda0
    ;;
  *)
    echo "error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [[ ${EUID} -eq 0 ]]; then
  SUDO=()
elif command -v sudo >/dev/null; then
  SUDO=(sudo)
else
  echo "error: run as root or install sudo" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
"${SUDO[@]}" apt-get update

# Keep build/runtime dependencies separate from display/E2E diagnostics so it is
# obvious which layer owns a missing library.
build_packages=(
  build-essential
  clang
  cmake
  curl
  file
  git
  libclang-dev
  libayatana-appindicator3-dev
  libglib2.0-dev
  libgtk-3-dev
  libssl-dev
  libsqlite3-dev
  libwebkit2gtk-4.1-dev
  librsvg2-dev
  pkg-config
  unzip
  xz-utils
)

diagnostic_packages=(
  webkit2gtk-driver
  x11-utils
  xauth
  xkb-data
  xvfb
  zenity
)

"${SUDO[@]}" apt-get install -y --no-install-recommends \
  "${build_packages[@]}" \
  "${diagnostic_packages[@]}"

# Install the checksum-verified official archive when the exact recorded Node LTS
# is absent. This avoids depending on a mutable third-party apt repository.
node_version=24.15.0
node_archive="node-v${node_version}-linux-${node_arch}.tar.xz"

if ! command -v node >/dev/null || [[ "$(node --version)" != "v${node_version}" ]]; then
  tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT

  curl --fail --location --retry 3 \
    "https://nodejs.org/dist/v${node_version}/${node_archive}" \
    -o "$tmp_dir/$node_archive"

  echo "$node_sha256  $tmp_dir/$node_archive" | sha256sum --check

  "${SUDO[@]}" tar \
    --extract \
    --xz \
    --file "$tmp_dir/$node_archive" \
    --directory /usr/local \
    --strip-components=1

  rm -rf "$tmp_dir"
  trap - EXIT
fi

# rustup installs only toolchains/caches in the conventional documented paths.
if ! command -v rustup >/dev/null; then
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    https://sh.rustup.rs |
    sh -s -- -y --profile minimal --no-modify-path
fi

export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"

rustup toolchain install 1.94.0 \
  --profile minimal \
  --component rustfmt \
  --component clippy

echo "Bootstrap complete. Run: npm ci && scripts/verify-ubuntu.sh"
