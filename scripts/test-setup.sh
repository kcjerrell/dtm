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
TEST_DATA_ARCHIVE="$CACHE_DIR/test_data_v4.zip"
fetch "https://github.com/kcjerrell/dtm/releases/download/test-data-v4/test_data_v4.zip" \
  "$TEST_DATA_ARCHIVE"
unzip -o "$TEST_DATA_ARCHIVE" -d .

mkdir -p test_data/temp

# Linux uses validated system tools and must never stage or execute the bundled
# macOS archives.
if [[ "$(uname -s)" != "Darwin" ]]; then
  command -v ffmpeg >/dev/null || { echo "error: install ffmpeg (sudo apt-get install -y ffmpeg)" >&2; exit 1; }
  command -v ffprobe >/dev/null || { echo "error: install ffprobe (sudo apt-get install -y ffmpeg)" >&2; exit 1; }
  ffmpeg -version >/dev/null
  ffprobe -version >/dev/null
  exit 0
fi

# These checksum-pinned macOS archives are bundled in test-data-v4. The WDIO
# helpers stage them in the app data directory, avoiding Evermeet during tests.
echo "845140e046f7abbfcf480d70eb1657ca09eb8fa775834518a1f43a5b867c96f9  test_data/ffmpeg/ffmpeg.7z" | shasum -a 256 -c -
echo "58e55ca02ad775d7a0776e050ce74752262fc2e622ba04d08b8f79e3f81251cd  test_data/ffmpeg/ffprobe.7z" | shasum -a 256 -c -
