#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED D7/D8/D9 — ordinary diary save / PDF regressions

D7: Create/edit/save an ordinary diary record. Persists after force-stop.
    GRIN flags must not drop the record.

D8: Export PDF of that record. PDF generates. App must not claim live
    GSTR-2B / E-Way Bill matching. No customer GSTIN in shared screenshots.

D9: Saved Records hub lists ordinary records. GRIN tile only if this
    binary is internal-grin (GRIN "1"). production AAB would be the
    wrong artifact.

Host SQLite diary fixtures are not this evidence.
EOF

require_physical_device D7-D9
still_not_run_until_owner_capture D7-D9
