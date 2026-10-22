#!/usr/bin/env bash
# Source before building or running DTM in the Debian 13 cloud environment.
DTM_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DTM_WORKSPACE=$(dirname "$DTM_ROOT")
DTM_SYSROOT="$DTM_WORKSPACE/.tools/sysroot"
export CARGO_HOME="$DTM_WORKSPACE/.cargo"
export RUSTUP_HOME="$DTM_WORKSPACE/.rustup"
export PATH="$CARGO_HOME/bin:$DTM_SYSROOT/usr/bin:$PATH"
export LD_LIBRARY_PATH="$DTM_SYSROOT/usr/lib/x86_64-linux-gnu:$DTM_SYSROOT/usr/lib/llvm-19/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PKG_CONFIG_PATH="$DTM_SYSROOT/usr/lib/x86_64-linux-gnu/pkgconfig:$DTM_SYSROOT/usr/share/pkgconfig"
export LIBCLANG_PATH=/usr/lib/x86_64-linux-gnu
export CARGO_BUILD_JOBS=6
# Tauri's asset scope excludes hidden path components. Keep app data outside .cache.
export XDG_DATA_HOME="$DTM_ROOT/work/linux-runtime/data"
export XDG_CONFIG_HOME="$DTM_ROOT/work/linux-runtime/config"
export XDG_CACHE_HOME="$DTM_ROOT/work/linux-runtime/cache"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
