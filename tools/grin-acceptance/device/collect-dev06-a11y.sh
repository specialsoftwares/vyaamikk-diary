#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=focusOrderNotes,contrastNotes,noPii=true"
pending_exit "device_pending" "DEV-06"
