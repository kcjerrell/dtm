#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_DIR=${DTM_FIXTURE_CACHE_DIR:-"$ROOT_DIR/.cache/dtm-fixtures"}
OFFLINE=${DTM_FIXTURES_OFFLINE:-0}
mkdir -p "$CACHE_DIR"

fetch() {
  local url=$1 destination=$2
  if [[ -s "$destination" ]]; then return; fi
  if [[ "$OFFLINE" == 1 ]]; then
    echo "error: offline fixture is missing: $destination" >&2
    exit 1
  fi
  local partial="${destination}.partial"
  rm -f "$partial"
  curl --fail --location --retry 3 "$url" -o "$partial"
  mv "$partial" "$destination"
}

cd "$ROOT_DIR"
fetch "https://github.com/kcjerrell/dtm/releases/download/test-data-v3/test_data_v3.zip" \
  "$CACHE_DIR/test_data_v3.zip"
unzip -o "$CACHE_DIR/test_data_v3.zip" -d .

mkdir -p test_data/temp

if [[ "$(uname -s)" == "Darwin" ]]; then
  # Only macOS uses the Evermeet installer. Linux uses validated system tools.
  FFMPEG_CACHE_DIR="test_data/ffmpeg"
  mkdir -p "$FFMPEG_CACHE_DIR"

  fetch "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z" "$CACHE_DIR/ffmpeg-8.0.1.7z"
  fetch "https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z" "$CACHE_DIR/ffprobe-8.0.1.7z"
  cp "$CACHE_DIR/ffmpeg-8.0.1.7z" "$FFMPEG_CACHE_DIR/ffmpeg.7z"
  cp "$CACHE_DIR/ffprobe-8.0.1.7z" "$FFMPEG_CACHE_DIR/ffprobe.7z"
fi
