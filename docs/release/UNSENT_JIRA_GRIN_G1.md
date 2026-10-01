# Unsent Jira comments — GRIN G1 (2026-10-01)

Atlassian/Jira write is not available in this environment. Do not mark GRIN, billing, or device tickets Done. Do not create duplicates.

## VYD-38 / VYD-39

No subscription-management or reconciliation source change in G1. Billing handlers are **deployed** (Cloud Functions v2, `asia-south1`, ACTIVE). `functions:config:get` `{}` does not prove flags false. `PLAY_BILLING_ENABLED` and sibling enablement keys were **absent** from those handlers’ env/secret key lists; effective enablement remains **unknown**. Client purchase-entry flags stay `"0"`. Do not mark billing Done.

## GRIN / goods-evidence (PR #27 domain)

- Domain checkpoint remains `55f2df1405c296336eea058238c8ae24e7a8b370` (targeted review, not whole-app certification).
- Isolated integration branch `integration/grin-g1-persistence` implements **G1 only** (emulator register/reconcile). Not production admission. Not GRIN-complete.
- Correction after `ee16ed9`: fail-closed serial counters, line-identity admission, bounded unknown input, commit log after successful commit, ABORTED-only retries, `typecheck:goods-evidence-g1`.
- Core Android candidate `6e3dbba` / PR #29 is frozen. VersionCode 23 unchanged. Core-only build packet deferred because owner-selected release now requires GRIN.
- G2–G6 remain open. Encrypted backup remains backlog.

Paste onto the existing goods-evidence / GRIN issue if one exists; do not open a duplicate.
