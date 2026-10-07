#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=networkSteps,issuedNumbersObserved"
pending_exit "device_pending" "DEV-05,CS-01"
