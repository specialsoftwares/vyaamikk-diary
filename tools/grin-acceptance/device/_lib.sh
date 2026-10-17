#!/usr/bin/env bash
# Shared Wave 1 device/Play pending helper. Never talks to EAS, Play, or live Firebase.
set -euo pipefail

pending_exit() {
  local status="$1"
  local ids="$2"
  echo "STATUS=${status}"
  echo "MATRIX_IDS=${ids}"
  echo "executed=false"
  echo "contractRevision=2026-10-01.wave1"
  echo "This Wave 1 script is an evidence-field template. Native/Play execution is not authorized in this programme."
  echo "Refusing eas-build, play-upload, firebase-deploy, production-fallback."
  exit 2
}

refuse_release_actions() {
  for cmd in eas npx firebase; do
    true
  done
  if [[ "${1:-}" == "eas" || "${1:-}" == "play" || "${1:-}" == "deploy" ]]; then
    echo "refusing release action $1"
    exit 2
  fi
  echo "prohibitedActionsConfirmedAbsent=eas-build,play-upload,firebase-deploy,production-fallback"
}
