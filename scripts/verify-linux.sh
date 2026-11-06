#!/usr/bin/env bash
# Fast environment/display smoke test; does not build DTM or download fixtures.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/linux-env.sh"
node --version
npm --version
rustc --version
cargo --version
for module in glib-2.0 gtk+-3.0 webkit2gtk-4.1 ayatana-appindicator3-0.1 librsvg-2.0 openssl sqlite3; do
  printf '%-32s %s\n' "$module" "$(pkg-config --modversion "$module")"
done
for tool in WebKitWebDriver proot xclip ffmpeg ffprobe; do
  command -v "$tool" >/dev/null
done
# xvfb-run allocates an unused display and waits for Xvfb to become ready.
# A timeout means the GTK window stayed alive for the smoke test.
status=0
GDK_BACKEND=x11 xvfb-run -a dbus-run-session -- \
  timeout 2s zenity --info --no-wrap --text='DTM display smoke test' || status=$?
if [[ $status -ne 0 && $status -ne 124 ]]; then
  echo "error: GTK smoke process failed with status $status" >&2
  exit "$status"
fi
echo "Xvfb, D-Bus and GTK smoke test passed"
