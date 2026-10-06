#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED I1/I2/I3 — interrupted upload, process death, account switching

I1: Start an evidence upload; interrupt (airplane / kill network / back out);
    retry. Original intact; no duplicate evidence id.

I2: Process death during save or upload (force-stop from Recents or
    am force-stop). Relaunch. No duplicate issuance. Pending work
    recoverable or honestly failed.

I3: Log out / switch account while work is pending. No cross-account
    publication. Hash uids in shared logs. Do not write UIDs into git.

Host outbox tests (SQLITE_HOST) are not this evidence.
EOF

require_physical_device I1-I3
still_not_run_until_owner_capture I1-I3
