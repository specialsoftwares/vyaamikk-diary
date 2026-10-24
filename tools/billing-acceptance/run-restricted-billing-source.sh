#!/usr/bin/env bash
# Restricted-billing SOURCE acceptance. Does not enable billing, create
# products, purchase, Save Play, or submit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${PLAY_BILLING_ENABLED:-}" == "true" ]]; then
  echo "REFUSE: PLAY_BILLING_ENABLED=true in this shell. SOURCE acceptance must not run against an enabled live gate."
  exit 2
fi

echo "=== Restricted billing SOURCE acceptance ==="
echo "Worktree: $ROOT"
echo "HEAD: $(git rev-parse HEAD)"
echo "Purchase-entry must stay 0; client billing flags off."

python3 - <<'PY'
import json
from pathlib import Path
eas = json.loads(Path("eas.json").read_text())
for name, profile in eas["build"].items():
    env = (profile or {}).get("env") or {}
    pe = env.get("EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED")
    qu = env.get("EXPO_PUBLIC_QUOTA_UPSELL_ENABLED")
    if name in ("preview", "production", "internal-grin"):
        assert pe == "0", f"{name} purchase-entry is {pe!r}, expected '0'"
        assert qu == "0", f"{name} quota-upsell is {qu!r}, expected '0'"
        print(f"ok {name}: purchase-entry=0 quota-upsell=0")
print("LIVE_STORE: NOT RUN (this script is SOURCE only)")
print("REAL-CHARGE RISK tests are named in docs/release/packets/RESTRICTED_BILLING_ACCEPTANCE_PLAN.md — do not execute them here.")
PY

npm run test:billing-play-constants
npm run test:billing-google-play
npm run test:billing-google-money
npm run test:billing-reconciliation-queue
npm run test:billing-entitlement
npm run test:billing-transition
npx --yes tsx src/billing/iap/iapPurchaseProcessor.test.ts
npx --yes tsx src/billing/iap/iapSession.test.ts
npx --yes tsx src/billing/iap/iapPendingPurchase.test.ts
npm run test:deletion-grace-copy

echo "SOURCE acceptance PASS. Catalog/RTDN/Play permissions: inspect separately; do not claim empty if NOT RUN."
