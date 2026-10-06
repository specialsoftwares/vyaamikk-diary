#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED G1–G7 + P1–P3 — GRIN offline capture, sync, attachments,
amendments / QC / returns, export

Live GRIN seven ABSENT. G1/G3/G7 need later backend + seeded admission.
Until then record backend_absent / blocked_by_runtime — not a product PASS.

G1 online create (LIVE_BACKEND): one serial; no duplicate.
G2 airplane create; force-stop; relaunch offline; reconnect. Local serial
   null while queued; exactly one issued serial after reconnect.
   Capture networkSteps + issuedNumbersObserved.
G3 reserve → upload evidence → confirmation. Stored-byte verify. Failed
   read stays pending/confirmation_refresh. No second serial.
G4 QC; amend a non-original field; partial return; EWB observation
   (manual). original snapshot unchanged; history appends.
G5 pack / export summary. originalsBundled=false; ITC not_determined;
   missing originals explicit. Not an archive of original files.
G6 UI hidden or backend_absent: record the honest block. Not a product pass.
G7 original download of a verified original (not the G5 pack). missing_control
   if the binary has no control. N/A until backend for live original-read.

P1 permission grant / attach. P2 deny or cancel honestly. P3 max files:
   policy deny; already-linked kept.

Synthetic evidence only while Packet D retention is unset. No customer
originals.
EOF

require_physical_device G1-G7
still_not_run_until_owner_capture G1-G7
