#!/bin/bash
set -e

# Base URL for the raw Github files
BASE_URL="https://raw.githubusercontent.com/drawthingsai/draw-things-community/main/Libraries/History/Sources"

# Target directory relative to project root
TARGET_DIR="src-tauri/src/projects_db/dt_project/fbs"

# Files to download and update
FILES=(
  "clip.fbs"
  "tensor_data.fbs"
  "tensor_history.fbs"
  "tensor_moodboard_data.fbs"
  "text_history.fbs"
)

# Ensure we are in the project root
cd "$(dirname "$0")/.."
mkdir -p "$TARGET_DIR"
mkdir -p "$TARGET_DIR/fbs"

for FILE in "${FILES[@]}"; do
  echo "Downloading $FILE..."
  curl -sSL "$BASE_URL/$FILE" -o "$TARGET_DIR/fbs/$FILE"
  
  echo "Processing $FILE..."
  # Remove " (indexed)" and " (primary)" from the files
  sed -i.bak -e 's/ (indexed)//g' -e 's/ (primary)//g' "$TARGET_DIR/fbs/$FILE"
  rm -f "$TARGET_DIR/fbs/$FILE.bak"
done

echo "Running flatc to update the generated code..."
flatc --rust -o "$TARGET_DIR" "$TARGET_DIR"/fbs/*.fbs

echo "Done!"
