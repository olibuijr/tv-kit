#!/usr/bin/env bash
# DEPRECATED: deployment moved into tvctl (see DEPLOY.md).
# This shim forwards to `tvctl kit sync` and will be removed.
set -euo pipefail
tvctl=$HOME/.local/bin/tvctl
echo "deploy.sh is deprecated; use: tvctl kit sync [MESSAGE]" >&2
exec "$tvctl" kit sync "$@"
