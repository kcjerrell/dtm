#!/usr/bin/env bash
set -euo pipefail

# Bun release assets and SHA-256 digests published by oven-sh/bun for bun-v1.4.3.
readonly VERSION="1.4.3"
readonly BASE_URL="https://github.com/oven-sh/bun/releases/download/bun-v${VERSION}"
readonly OUT_DIR="${BUN_OUT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../src-tauri" && pwd)/binaries}"

artifact() {
  case "$1" in
    x86_64-unknown-linux-gnu) echo "bun-linux-x64.zip 3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18" ;;
    aarch64-unknown-linux-gnu) echo "bun-linux-aarch64.zip efa9813da5ed72423bf847f916e8d2c47c0d776add972354026a75e10da9aa21" ;;
    x86_64-apple-darwin) echo "bun-darwin-x64.zip 62660e6438eb872278877acca77e1152d5d031324df368d4a81b428211489d2d" ;;
    aarch64-apple-darwin) echo "bun-darwin-aarch64.zip 80afd4c069b46a6fa8f3ec520bebc750a7843e4a8d5b9583d29ad436c00a3403" ;;
    *) echo "error: unsupported Bun target: $1" >&2; return 2 ;;
  esac
}

prepare_target() {
  local target="$1" asset checksum archive work extracted destination actual
  read -r asset checksum <<<"$(artifact "$target")"
  mkdir -p "$OUT_DIR"
  archive="${OUT_DIR}/${asset}"
  destination="${OUT_DIR}/bun-${target}"
  work="$(mktemp -d "${OUT_DIR}/.bun.XXXXXX")"
  trap 'rm -rf "$work"' RETURN
  curl --fail --location --retry 3 --output "$archive" "${BASE_URL}/${asset}"
  actual="$(sha256_file "$archive")"
  if [[ "$actual" != "$checksum" ]]; then
    echo "error: checksum mismatch for ${asset} (${target}): expected ${checksum}, got ${actual}" >&2
    rm -f "$archive"
    return 1
  fi
  unzip -q "$archive" -d "$work"
  extracted="$(find "$work" -type f -name bun -print -quit)"
  [[ -n "$extracted" ]] || { echo "error: ${asset} did not contain bun" >&2; return 1; }
  install -m 755 "$extracted" "${destination}.tmp"
  mv "${destination}.tmp" "$destination"
  rm -f "$archive"
  "$destination" --version | { read -r found; [[ "$found" == "$VERSION" ]] || { echo "error: ${target} produced Bun ${found}, expected ${VERSION}" >&2; exit 1; }; }
}

sha256_file() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

host_target() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) echo x86_64-unknown-linux-gnu ;;
    Linux-aarch64|Linux-arm64) echo aarch64-unknown-linux-gnu ;;
    Darwin-x86_64) echo x86_64-apple-darwin ;;
    Darwin-arm64) echo aarch64-apple-darwin ;;
    *) echo "error: unsupported host $(uname -s)-$(uname -m)" >&2; return 2 ;;
  esac
}

case "${1:-host}" in
  --manifest)
    for target in x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin; do
      read -r asset checksum <<<"$(artifact "$target")"
      printf '%s %s %s/%s\n' "$target" "$checksum" "$BASE_URL" "$asset"
    done
    ;;
  host) prepare_target "$(host_target)" ;;
  universal-apple-darwin)
    [[ "$(uname -s)" == Darwin ]] || { echo "error: universal Bun assembly requires macOS lipo and must run on macOS" >&2; exit 2; }
    prepare_target x86_64-apple-darwin
    prepare_target aarch64-apple-darwin
    lipo -create "$OUT_DIR/bun-x86_64-apple-darwin" "$OUT_DIR/bun-aarch64-apple-darwin" -output "$OUT_DIR/bun-universal-apple-darwin.tmp"
    chmod 755 "$OUT_DIR/bun-universal-apple-darwin.tmp"
    mv "$OUT_DIR/bun-universal-apple-darwin.tmp" "$OUT_DIR/bun-universal-apple-darwin"
    "$OUT_DIR/bun-universal-apple-darwin" --version | grep -Fx "$VERSION" >/dev/null
    ;;
  *) prepare_target "$1" ;;
esac
