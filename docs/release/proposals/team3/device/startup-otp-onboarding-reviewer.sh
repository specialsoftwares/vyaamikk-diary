#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED D3/D4/D5/D6 — startup, OTP/onboarding, reviewer dashboard

D3 startup:
  Force-stop; reboot; open. Splash completes; main tabs; legal date
  2026-07-27; no token printed.

D4 phone OTP:
  Sign-in with the tester's own number. Session bound to that uid.
  Do not paste OTP / password / recovery codes into git. Hash uid in
  shared logs. UIDs via private channel (see coordinator).

D5 reviewer dashboard:
  Reviewer login +91 9000000000 / 654321 ONLY if the live test-phone
  fixture is verified. Reaches tabs; no founder email. Skip and record
  fixture_unverified rather than inventing a pass.

D6 onboarding:
  Email / profile onboarding if shown. Completes; consents recorded.

Do not treat host-mounted inert React as a cold-start.
EOF

require_physical_device D3-D6
still_not_run_until_owner_capture D3-D6
