#!/usr/bin/env bash
# Fast environment/display smoke test; does not build DTM or download fixtures.
set -euo pipefail

node --version
npm --version
rustc --version
cargo --version
for module in glib-2.0 gtk+-3.0 webkit2gtk-4.1 ayatana-appindicator3-0.1 librsvg-2.0 openssl sqlite3; do
  printf '%-32s %s\n' "$module" "$(pkg-config --modversion "$module")"
done

display=:99
Xvfb "$display" -screen 0 1024x768x24 -nolisten tcp > /tmp/dtm-xvfb.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
for _ in {1..50}; do
  DISPLAY="$display" xdpyinfo >/dev/null 2>&1 && break
  sleep 0.1
done
DISPLAY="$display" xdpyinfo >/dev/null
# zenity is a trivial GTK process. A timeout exit is success: it proves that the
# window remained alive and GTK could connect to Xvfb.
set +e
DISPLAY="$display" timeout 2s zenity --info --no-wrap --text='DTM display smoke test' >/dev/null 2>&1
status=$?
set -e
if [[ $status -ne 0 && $status -ne 124 ]]; then
  echo "error: GTK smoke process failed with status $status" >&2
  exit "$status"
fi
echo "Xvfb and GTK smoke test passed"
