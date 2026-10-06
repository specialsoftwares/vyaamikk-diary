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

Steps (after B1+B2, neither granted):
  1. Re-read Play App bundle explorer immediately before the authorized build.
  2. Confirm Internal Testing offers a versionCode strictly greater than the
     then-highest uploaded Play code (reminder: 2026-10-06 highest vc22;
     vc23 UNRESERVED).
  3. On the OnePlus 12R, update from Play over the existing vc22 install.
  4. Cold start. Record About / versionCode / versionName.
  5. Confirm existing diary, PO, credit, letterhead, PDF still open.
  6. Confirm SQLite v10 migrated (app usable; no data-loss prompt).
  7. Fill RESULT_CAPTURE.template.md. Hash uids. No OTPs in git.

Do not run this as PASS because a host SQLite fixture is green.
EOF

require_physical_device D1
# Phone present still does not authorize a PASS (no Internal-GRIN AAB; B1 ungranted).
still_not_run_until_owner_capture D1
