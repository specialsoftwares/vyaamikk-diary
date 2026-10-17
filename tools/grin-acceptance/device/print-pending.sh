#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
pending_exit "device_pending" "DEV-01,DEV-02,DEV-03,DEV-04,DEV-05,DEV-06,PLAY-01,PLAY-02"
