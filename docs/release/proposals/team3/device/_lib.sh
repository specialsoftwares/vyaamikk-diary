#!/usr/bin/env bash
# Team 3 Internal-GRIN device helpers. Never talks to EAS, Play write, or live Firebase deploy.
# Prepared without waiting for an AAB. No connected phone => NOT RUN, never PASS.
# Host SQLite / mounted inert React / emulator / CI greens are not device evidence.
set -euo pipefail

DEVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="${PACKAGE_NAME:-com.specialsoftwares.vyaamikkdiary}"
CURRENT_APP_BLOBS="${CURRENT_APP_BLOBS:-540e07aa07f376716484adb879ce66cb9fb170ce}"
FINAL_SHA="${FINAL_SHA:-540e07aa07f376716484adb879ce66cb9fb170ce}"
RETIRED_DO_NOT_BUILD="${RETIRED_DO_NOT_BUILD:-520f9f9/56f2040/313025f/fcda7cd/60c4bc1_alone}"

refuse_release_actions() {
  case "${1:-}" in
    eas|play|deploy|ota|prebuild|submit)
      echo "refusing release action ${1}"
      echo "STATUS=REFUSED"
      exit 2
      ;;
  esac
  echo "prohibitedActionsConfirmedAbsent=eas-build,play-upload,firebase-deploy,ota,prebuild,production-fallback"
}

count_adb_devices() {
  if ! command -v adb >/dev/null 2>&1; then
    echo 0
    return
  fi
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {c++} END {print c+0}'
}

print_common_header() {
  local row_id="$1"
  echo "ROW_ID=${row_id}"
  echo "PACKAGE=${PACKAGE_NAME}"
  echo "CURRENT_APP_BLOBS=${CURRENT_APP_BLOBS}"
  echo "FINAL_SHA=${FINAL_SHA}"
  echo "RETIRED_DO_NOT_BUILD=${RETIRED_DO_NOT_BUILD}"
  echo "NOTE=internal_aab_is_540e07a_ci_37445383607_success_on_7e0d629_docs_only"
  echo "PURCHASE_ENTRY=off"
  echo "B1=not_granted"
  echo "B2=not_granted"
  echo "AAB_REQUIRED_TO_PREPARE_SCRIPT=no"
}

refuse_host_sqlite_as_device() {
  if [[ -n "${SQLITE_HOST:-}" || -n "${GRIN_SQLITE_HOST:-}" ]]; then
    echo "host_sqlite_env_set=true"
    echo "host_sqlite_is_device_evidence=false"
  fi
  echo "mounted_inert_react_is_device_evidence=false"
  echo "emulator_is_device_evidence=false"
  echo "ci_green_is_device_evidence=false"
}

not_run_exit() {
  local row_id="$1"
  local reason="$2"
  print_common_header "${row_id}"
  refuse_host_sqlite_as_device
  echo "STATUS=NOT_RUN"
  echo "PASS=false"
  echo "executed=false"
  echo "REASON=${reason}"
  echo "Capture a result only on physical hardware with a labelled PLAY_INSTALLED or NATIVE_DEVICE artifact."
  echo "Use RESULT_CAPTURE.template.md. Do not invent UIDs, serials, or OTPs."
  exit 2
}

require_physical_device() {
  local row_id="$1"
  local n
  n="$(count_adb_devices)"
  echo "adb_device_count=${n}"
  if [[ "${n}" -lt 1 ]]; then
    not_run_exit "${row_id}" "no_connected_phone"
  fi
}

# Even with a phone attached, this programme has not authorized B1/B2.
# Scripts print the intended steps and still exit NOT_RUN until the owner
# records a filled RESULT_CAPTURE on that phone. Never auto-PASS.
still_not_run_until_owner_capture() {
  local row_id="$1"
  print_common_header "${row_id}"
  refuse_host_sqlite_as_device
  echo "STATUS=NOT_RUN"
  echo "PASS=false"
  echo "executed=false"
  echo "REASON=owner_result_capture_required; B1_not_granted; live_GRIN_seven_ABSENT"
  echo "A connected phone is not a PASS. Fill RESULT_CAPTURE.template.md after the named run."
  exit 2
}
