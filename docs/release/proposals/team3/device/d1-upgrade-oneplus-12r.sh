#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED D1 — upgrade path on OnePlus 12R (do not wait for this script to
exist after the AAB; the script is the checklist)

Device (owner-supplied, do not invent IDs):
  model: OnePlus 12R
  Android: 16
  package: com.specialsoftwares.vyaamikkdiary
  current: Play Internal vc22 YES
  available: TODAY
  path: PLAY_INSTALLED upgrade over vc22 (not sideload labelled PLAY_INSTALLED)
  binary: 540e07aa07f376716484adb879ce66cb9fb170ce
          (do not rebuild 520f9f9 / 56f2040 / 313025f / fcda7cd / 60c4bc1
          alone; do not checkout 7e0d629 as B1)
  purchase-entry: OFF — this is not an interactive purchase-test build

Steps (after B1+B2, neither granted; this instruction does not authorize them):
  1. Re-read Play App bundle explorer immediately before the authorized build.
  2. Confirm Internal Testing offers a versionCode strictly greater than the
     then-highest uploaded Play code (reminder: 2026-10-06 highest vc22;
     vc23 UNRESERVED).
  3. On the OnePlus 12R, update from Play over the existing vc22 install.
     Do not uninstall. Do not clear data.
  4. Cold start. Record About / versionCode / versionName.
  5. Confirm existing diary, PO, credit, letterhead, PDF still open.
  6. Confirm SQLite v10 migrated (app usable; no data-loss prompt).
  7. Continue PHONE_HANDOFF.md §7: startup, OTP/onboarding/reviewer,
     diary save/PDF, GRIN offline capture/sync/attachments/amendments/
     QC/returns/export, interrupted upload, process death, account
     switching, languages, accessibility, low-memory.
  8. Fill RESULT_CAPTURE.template.md. Hash uids. No OTPs in git.

Do not run this as PASS because a host SQLite fixture is green.
adb empty => NOT_RUN, never PASS.

EOF

require_physical_device D1
# Phone present still does not authorize a PASS (no Internal-GRIN AAB; B1 ungranted).
still_not_run_until_owner_capture D1
