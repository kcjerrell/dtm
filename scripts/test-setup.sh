#!/bin/bash
set -e

curl -L "https://github.com/kcjerrell/dtm/releases/download/test-data-v3/test_data_v3.zip" -o test_data.zip
unzip -o test_data.zip -d .
rm test_data.zip
mkdir -p test_data/temp

# Preload ffmpeg archives used by the in-app installer so tests can seed app_data/temp
# instead of waiting on network every run.
FFMPEG_CACHE_DIR="test_data/ffmpeg"
mkdir -p "$FFMPEG_CACHE_DIR"

if [ ! -f "$FFMPEG_CACHE_DIR/ffmpeg.7z" ]; then
  curl -L "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z" -o "$FFMPEG_CACHE_DIR/ffmpeg.7z"
fi

if [ ! -f "$FFMPEG_CACHE_DIR/ffprobe.7z" ]; then
  curl -L "https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z" -o "$FFMPEG_CACHE_DIR/ffprobe.7z"
fi
