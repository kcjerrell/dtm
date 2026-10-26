#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/linux-env.sh"
for tool in Xvfb xvfb-run xauth proot dbus-run-session WebKitWebDriver; do
  command -v "$tool" >/dev/null || {
    echo "error: $tool is missing; run bash scripts/bootstrap-linux.sh" >&2
    exit 1
  }
done
export DTM_WDIO_LINUX=1
export GDK_BACKEND=x11
exec xvfb-run -a -s '-screen 0 1280x1024x24 -nolisten tcp' \
  dbus-run-session -- node "$DTM_ROOT/scripts/wdio.mjs" "$@"
