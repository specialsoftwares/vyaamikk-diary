#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"
refuse_release_actions "${1:-}"

cat <<'EOF'
INTENDED L1–L3 / A11 / M1 / W1 — languages, accessibility, low-memory

L1: Switch en, hi, ta, te, gu. Critical actions not clipped.
L2: Large text / font scale. Primary actions reachable.
L3: Keyboard. Fields not permanently covered; save reachable.
A11: TalkBack on (may use D1 OnePlus 12R). Sign-in, save, GRIN primary
     actions announced. Record TalkBack version. D2 unnamed — do not
     invent a second TalkBack phone.
M1: dumpsys meminfo RSS/PSS during a G3-like upload if the binary can
     run it. Optional ≤4 GiB phone not identified. OOM-free not claimed
     from source.
W1: Repeated daily-use. No sustained unusable jank; record duration.

Accessibility Inspector / host React is not TalkBack.
EOF

require_physical_device L-A11-M1
still_not_run_until_owner_capture L-A11-M1
