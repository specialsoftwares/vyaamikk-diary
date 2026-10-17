#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=accountUidsHashed,crossAccountLeak,dispatchGeneration"
pending_exit "device_pending" "DEV-03,CS-03"
