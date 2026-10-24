#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=buildChannel=play-installed,grinAdmission=off"
pending_exit "play_pending" "PLAY-01"
