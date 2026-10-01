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

## Programme start (unsent, 2026-10-01)

Owner authorized isolated G1–G5 source plus G6 automated tests/review/device preparation. Combined branch `integration/grin-g1-g5-source` at contract `d9cf115`. Five local AI team agents on separate worktrees (not human review). PR #30 stays G1-only draft. No main merge, deploy, build, Play, or billing activation. Do not mark GRIN or device tickets Done.

Paste onto the existing goods-evidence / GRIN issue if one exists; do not open a duplicate.

## Wave 1 combined wiring (unsent, 2026-10-01)

Combined head `3fe5c46775ec0f146fb6af549885771ffbcff68d` on `integration/grin-g1-g5-source`. Team commits merged: T1 `5c7543d`, T2 `8989b48`, T3 `3c1303b`, T4 `355e575`, T5 matrix `df5f0a5`. Functions GRIN callables remain unexported. Live Storage/Rules unchanged. GRIN default-off. versionCode 23 unchanged. Purchase-entry flags remain `"0"`. Native/device, billing, and public release stay open. Do not mark those tickets Done.

## Team 5 Wave 1 implementation review (unsent)

`070a388` on `team/grin-t5-qa`: Wave 1 source **approved with findings**. Medium: mutation missing receipt `invalid` vs `not_found`; validation before auth gate; outbox lease then skip unsupported types. Not G6. Not production. Do not mark GRIN or device tickets Done.

## Wave 2 corrections start (unsent, 2026-10-02)

Inspected combined `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined advanced to `6b2690315ae746013a02a982f4c76a75d9ac3915` (W2-05 orchestrator extract + T5 `c2ef669` CS-02 test, not W2-03 approval). W2-01…W2-06 assigned on isolated `integration/grin-g1-g5-source`. Functions still unexported. Live Rules unchanged. versionCode 23. Purchase-entry flags `"0"`. Do not mark G6/device/billing/public-release Done. `gh` unauthenticated — no combined PR from this environment. Manual compare: https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source

## Team 5 Wave 2 PHASE 1 reproductions (unsent, 2026-10-02)

`bff108c3d20a6806fad70e99b7c0bfe01d3e038c` on `team/grin-t5-qa`. Independently reproduced W2-01…W2-05 against `6b26903`. Mapping is not closure. Wave 2 not accepted. Native/TalkBack/Play/live GST/2B not run. Do not mark G6/device/billing/public-release Done.

