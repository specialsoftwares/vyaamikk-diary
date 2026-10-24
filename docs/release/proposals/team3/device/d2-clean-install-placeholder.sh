#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED D2 — clean-install PLACEHOLDER (device still unnamed)

Do not invent a second phone. Owner must name model / Android / availability
before this row can run. A second phone is desirable but must not stop D1.

Do NOT uninstall or clear vc22 on the OnePlus 12R without owner agreement
to the loss-risk in PHONE_HANDOFF.md §8:
  local unsynced diary / PO / credit / letterhead in SQLite,
  on-device PDFs, GRIN outbox / pending uploads / unissued serials,
  on-device session (re-OTP required).
Clean-install coverage stays pending until actually executed.

Steps (after D1 record is saved AND owner agrees to loss-risk):
  1. Use a second Android 12+ phone, OR uninstall on D1 only after D1
     evidence is saved and the owner confirms this is the D2 path.
  2. Install labelled PLAY_INSTALLED (Internal) or NATIVE_DEVICE (sideload
     APK — never call sideload PLAY_INSTALLED).
  3. Empty local DB. Same launch / sign-in as D1.
  4. Fill RESULT_CAPTURE.template.md with the named device. Leave model
     blank in git until the owner supplies it.

Current form: D2 model blank. Status: NOT RUN. Not executed this packet.

EOF

echo "D2_DEVICE="
echo "D2_NAMED=false"
require_physical_device D2
still_not_run_until_owner_capture D2
