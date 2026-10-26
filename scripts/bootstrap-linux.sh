#!/usr/bin/env bash
# Install Debian 13 x86_64 cloud-test dependencies locally, without root.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/linux-env.sh"
source /etc/os-release
if [[ "$ID" != debian || "$VERSION_ID" != 13 || "$(uname -m)" != x86_64 ]]; then
  echo "error: this test environment requires Debian 13 x86_64" >&2
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major!==24 || minor<15) throw Error("Node >=24.15 <25 required")'

TOOLS_DIR="$DTM_WORKSPACE/.tools"
mkdir -p "$TOOLS_DIR/apt/lists/partial" "$TOOLS_DIR/apt/archives/partial" "$DTM_SYSROOT"
cat > "$TOOLS_DIR/apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie-updates main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
SOURCES
cat > "$TOOLS_DIR/apt/apt.conf" <<APTCONF
Dir::Etc::sourcelist "$TOOLS_DIR/apt/sources.list";
Dir::Etc::sourceparts "-";
Dir::Etc::parts "-";
Dir::State::lists "$TOOLS_DIR/apt/lists";
Dir::Cache::archives "$TOOLS_DIR/apt/archives";
Dir::Cache::pkgcache "$TOOLS_DIR/apt/pkgcache.bin";
Dir::Cache::srcpkgcache "$TOOLS_DIR/apt/srcpkgcache.bin";
APT::Sandbox::User "$(id -un)";
APTCONF
export APT_CONFIG="$TOOLS_DIR/apt/apt.conf"
apt-get update
apt-get -o Debug::NoLocking=1 install --download-only -y --no-install-recommends \
  build-essential clang cmake curl file git python3 libclang-dev \
  libayatana-appindicator3-dev libglib2.0-dev libgtk-3-dev libssl-dev \
  libsqlite3-dev libwebkit2gtk-4.1-dev librsvg2-dev pkg-config unzip xz-utils \
  webkit2gtk-driver x11-utils xauth xkb-data xvfb zenity proot xclip ffmpeg dbus
for archive in "$TOOLS_DIR"/apt/archives/*.deb; do
  dpkg-deb -x "$archive" "$DTM_SYSROOT"
done

# The sysroot supplements the base image: missing symlink targets can be supplied
# by system packages. Relocate pkg-config prefixes so Cargo finds extracted headers.
python3 - "$DTM_SYSROOT" <<'PYTHON'
from pathlib import Path
import sys
root = Path(sys.argv[1])
for link in root.rglob('*'):
    if link.is_symlink() and not link.exists():
        try:
            candidate = Path('/') / link.resolve().relative_to(root)
        except ValueError:
            continue
        if candidate.exists():
            link.unlink()
            link.symlink_to(candidate)
for pc in root.rglob('*.pc'):
    pc.write_text(pc.read_text().replace('/usr', str(root) + '/usr'))
PYTHON

if ! command -v rustup >/dev/null; then
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    https://sh.rustup.rs -o "$TOOLS_DIR/rustup-init.sh"
  sh "$TOOLS_DIR/rustup-init.sh" -y --profile minimal --no-modify-path --default-toolchain 1.94.0
fi
rustup toolchain install 1.94.0 --profile minimal --component rustfmt --component clippy
# WDIO uses DTM's embedded driver; a separate tauri-driver installation is unnecessary.
echo "Bootstrap complete. Source scripts/linux-env.sh, then run bash scripts/verify-linux.sh."
