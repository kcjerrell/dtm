#!/usr/bin/env bash
set -euo pipefail

TEST_DATA_ARCHIVE="test_data_v4.zip"
curl --fail --location --retry 3 \
  "https://github.com/kcjerrell/dtm/releases/download/test-data-v4/$TEST_DATA_ARCHIVE" \
  --output "$TEST_DATA_ARCHIVE"
unzip -o "$TEST_DATA_ARCHIVE" -d .
rm "$TEST_DATA_ARCHIVE"
mkdir -p test_data/temp

# These checksum-pinned macOS archives are bundled in test-data-v4. The WDIO
# helpers stage them in the app data directory, avoiding Evermeet during tests.
echo "845140e046f7abbfcf480d70eb1657ca09eb8fa775834518a1f43a5b867c96f9  test_data/ffmpeg/ffmpeg.7z" | shasum -a 256 -c -
echo "58e55ca02ad775d7a0776e050ce74752262fc2e622ba04d08b8f79e3f81251cd  test_data/ffmpeg/ffprobe.7z" | shasum -a 256 -c -
