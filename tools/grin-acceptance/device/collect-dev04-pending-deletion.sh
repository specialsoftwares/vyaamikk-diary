#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=denyCode=forbidden,noExistenceLeak=true"
pending_exit "device_pending" "DEV-04"
