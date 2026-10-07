#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
echo "expected_fields=talkbackVersion,screenshotPaths,matrixIds=DEV-02,G6-R02"
pending_exit "device_pending" "DEV-02,G6-R02"
