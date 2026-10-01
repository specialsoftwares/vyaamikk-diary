#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"
echo "STATUS=device_pending"
echo "No EAS, Play, firebase deploy, or production fallback from Team 5 Wave 1 scripts."
exit 2
