#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/linux-env.sh"
# WebKit locates its helpers at a compiled-in /usr path. PRoot maps the local
# packages there without requiring root or disabling WebKit's sandbox.
exec proot -b "$DTM_SYSROOT/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1:/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1" \
  "$DTM_ROOT/src-tauri/target/debug/dtm" "$@"
