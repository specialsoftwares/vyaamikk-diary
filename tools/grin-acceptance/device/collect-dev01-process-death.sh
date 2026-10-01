#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=networkSteps,issuedNumbersObserved,outboxStatesObserved,worktreeHead,appVersionCode"
pending_exit "device_pending" "DEV-01,CS-01"
