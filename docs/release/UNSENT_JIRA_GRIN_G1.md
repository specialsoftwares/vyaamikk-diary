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

## Team 1 W2-06 (unsent, 2026-10-02)

`cbcb1b9acbda254258676e5a7d7056296470d77a` on `team/grin-t1-backend`: authenticated undeployed G1 composition + mobile JS httpsCallable transport. `functions/src/index.ts` still has no GRIN export. App still uses the labelled uninjected FAKE port. Do not mark backend deploy or G6 Done.

## Teams 2–4 Wave 2 landings (unsent, 2026-10-02)

Merged onto `integration/grin-g1-g5-source`: T2 `06d897a719637abeb1301292af9d85fa370b8b8e` (identity + retained isolated Storage reads), T3 `9a0de6dd83ff51293698b69cd7dc23051e737b7b` (attempt fence + category persist + production v10 tests), T4 `decac00` (no session self-revive; remaining screens off fixtures). Coordinator glued `type`/`commandType` and stopped mutation from rewriting register `payload_json`. Wave 2 not accepted pending Team 5 PHASE 2. Live Rules/Functions unchanged. versionCode 23. Flags `"0"`. Do not mark G6/device/billing/public-release Done.

## Team 5 Wave 2 PHASE 2 (unsent, 2026-10-02)

`3fe4071e95875a02b25f636739c1f04f8564bf09` on `team/grin-t5-qa` reviewed combined `e94b78cdc07458c457ba7ef5bb6308109d7ec2cd`. Independently re-executed W2-01…W2-05 as reproduced-then-fixed (SQLITE_HOST / INJECTED / isolated Storage emulator / mounted-inert). Wave 2 **not accepted**: app still FAKE uninjected G1; Functions unexported; live Rules unchanged; native/TalkBack/Play/live GST/2B open. Do not mark G6/device/billing/public-release Done.

## Team 5 WAVE2APP F5 (unsent, 2026-10-02)

`889f01106c497e1d7feca3147cf86ea0c3c20d8f` on `team/grin-t5-qa` reviewed combined `7623eef446036cb6290e99b4adbe6f14fb19e198`. Independently re-executed F1–F4 as reproduced-then-fixed (origin.bind actual bodies; SQLITE_HOST+INJECTED join; G1 Firestore `127.0.0.1:8088`; T2 `8091`+`9200`). Wave 2 **not accepted**. Functions unexported. Live Rules unchanged. versionCode 23. Flags `"0"`. No NATIVE_DEVICE / TalkBack / Play / billing / public-release. Do not mark those tickets Done.

## Coordinator typecheck + local ci:verify (unsent, 2026-10-02)

Validated application SHA `99ee60ceba2f7f4adec01f4e3559c485608687ac` on `integration/grin-g1-g5-source` (parent `f2407cb3574d528dd0da6d061f6ab108f3a16a87`). Root `tsc --noEmit`, G1/G2 adapter typechecks, and `functions` `tsc` passed. Local `npm run ci:verify` exited 0: `test:all` 152/152 in 247.6s; G1 Firestore emulator `demo-vyaamikk-grin-g1` (composed ok); G2 Firestore+Storage `demo-vyaamikk-grin-g2` (storage + rules ok). Local invoice-renderer Docker skipped (`docker not available locally`). `gh` not logged in — no draft PR from this environment. Compare: https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source . Functions GRIN callables remain unexported. Live Rules/IAM/secrets/flags unchanged. versionCode 23. Purchase-entry flags `"0"`. Wave 2 / G6 / device / billing / public-release **not** Done.

## Evidence workflow E1–E5 start (unsent, 2026-10-02)

Starting combined HEAD `13f90ed33ce60a701eb2e3a73a1e279f2be1888f`. Contract `2026-10-02.wave2evidence`. Findings E1–E5 are **open** at application SHA `99ee60c` (missing evidence port; invalid verification admission; lost verification metadata; image-only picker; incomplete pack categories). Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 E1–E5 reproductions (unsent, 2026-10-02)

`4711f7d71060e61556e368137f81ab90babbe509` on `team/grin-t5-qa` independently executed all eight E1–E5 cases against combined `41670aa85c32cb174277930ca08eed3a5af93243` (SQLITE_HOST / INJECTED / HOST_FILESYSTEM). All **reproduced**. Mapping is not closure. Wave 2 **not accepted**. STORAGE_EMULATOR / FIRESTORE_EMULATOR / NATIVE_DEVICE not claimed. Do not mark GRIN / G6 / billing / public-release Done.

