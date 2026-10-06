#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

ROWS=(
  D1 D2 D3 D4 D5 D6 D7 D8 D9
  G1 G2 G3 G4 G5 G6 G7
  I1 I2 I3
  P1 P2 P3
  L1 L2 L3 A11 M1 W1
)

print_common_header "MATRIX"
refuse_host_sqlite_as_device
n="$(count_adb_devices)"
echo "adb_device_count=${n}"
echo "D1_DEVICE=OnePlus 12R"
echo "D1_ANDROID=16"
echo "D1_VC22=yes"
echo "D1_AVAILABLE=today"
echo "D2_DEVICE="
echo "XR=N/A_until_backend"
echo "LIVE_GRIN_SEVEN=ABSENT"

for id in "${ROWS[@]}"; do
  echo "ROW ${id}=NOT_RUN"
done

echo "STATUS=NOT_RUN"
echo "PASS=false"
echo "executed=false"
if [[ "${n}" -lt 1 ]]; then
  echo "REASON=no_connected_phone"
else
  echo "REASON=owner_result_capture_required; B1_not_granted"
fi
echo "No connected phone = NOT RUN, never PASS. Host SQLite / mounted inert React is not device evidence."
exit 2
