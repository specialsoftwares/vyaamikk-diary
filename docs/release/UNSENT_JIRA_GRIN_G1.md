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

## Team 2 E1–E5 evidence integrity (unsent, 2026-10-02)

`29c6d3fd85482f207299dc0195047f624170585b` on `team/grin-t2-evidence`: stored-byte `actualSha256`, upload categories include stock_accounting/payment/gst/return_document, pack A/B/C/D INJECTED, STORAGE_EMULATOR 8091/9200. Functions still unexported. Live Rules unchanged. T1 JS/Functions round-trip, T3 admission/descriptors, T4 picker/appBinding remain open. Do not mark GRIN Done.

## Team 3 E2/E3 verification admission (unsent, 2026-10-02)

`0d0dd841d4ec37e05313ce4070a86968fe6510b9` on `team/grin-t3-offline`: `originalIdentityMatches` requires actual SHA-256 of retained local bytes; additive descriptor columns; `expectedVersion===0` shim removed. SQLITE_HOST outbox + F2 interop. T1 transport and T4 picker/pack still open. Do not mark GRIN / G6 Done.

## Team 4 picker / pack / evidence factory (unsent, 2026-10-02)

`83f10f871515eee192d9ebae6d277351d50577ae` on `team/grin-t4-product`, merged to combined. Production `GrinOutbox` now receives `evidencePortFactory()` (`createFirebaseJsGrinEvidenceTransport`). PDF/image/camera retention hashes retained bytes; pack is a manifest/PDF summary (`originalsBundled: false`). `test:grin-product` SQLITE_HOST passed including picker, origin.bind, pack A–D. `expo-document-picker ~14.0.8` added. NATIVE_DEVICE not claimed. T1 JS→Functions-emulator round-trip still open. Functions unexported. versionCode 23. Purchase-entry flags `"0"`. Do not mark GRIN / G6 / billing / public-release Done.

## Team 1 E1 Functions-emulator round-trip (unsent, 2026-10-02)

`15bd2a6bd1bc04f0605112e095a1eb0c314be224` on `team/grin-t1-backend`, merged to combined. Isolated `tools/goods-evidence-emulator/functions-entry` compose reserve → JS Storage upload → stored-byte verify. `npm run test:goods-evidence-g1-functions-emulator` passed with real `httpsCallable` (not mocked) on demo-vyaamikk-grin-t1. `functions/src/index.ts` still has no GRIN export. Live Rules unchanged. versionCode 23. Purchase-entry flags `"0"`. Team 5 re-review next. Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 E1–E5 PHASE 2 rereview (unsent, 2026-10-02)

Independent QA of corrected combined `ae0339a30edd92e92f4b05f734fddb4710aacaf4` on `team/grin-t5-qa`. PHASE 1 mapping at `41670aa` / `4711f7d` is not closure. Executed: persistGrinOwnerSession wires both JS ports; Functions-emulator real `httpsCallable` (unset hosts fail); SQLITE_HOST E2/E3; Firestore adapter register→amend→QC→return→read-confirmed; mounted EWB/attachments/pack with retirement. E4 remaining: pack assembler hardcodes `osConversionOccurred: false`. Production persist still has no `localOriginalHasher`. `functions/src/index.ts` HOLD. versionCode 23. Purchase-entry flags `"0"`. GRIN default-off. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release Done.

## Coordinator E4/E1 source closeout after T5 PHASE 2 (unsent, 2026-10-02)

T5 PHASE 2 `049e7e0` of `ae0339a` left two source gaps. Combined follow-up: persist `os_conversion_occurred` / `claimed_mime` (additive ALTER, no DB_VERSION bump); pack assembler uses retained conversion via `normalizeOsConversionOccurred` (never invents `false`); `persistGrinOwnerSession` passes `createAppLocalOriginalHasher` (APP_FILESYSTEM); FIPS 180-4 K typo `0fc19cd6`→`0fc19dc6` so production chunk hashes match independent SHA-256. `test:grin-product` + `test:grin-outbox` SQLITE_HOST passed including persist-hasher durable PDF. `functions/src/index.ts` HOLD. versionCode 23. Flags `"0"`. **Wave 2 not accepted** pending T5 follow-up. Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 E4/hasher PHASE 3 (unsent, 2026-10-02)

Independent follow-up `d3d48fc8138ee407784788acf1209d9dc4e8de45` of combined `d4b6e1fa0a6adf8dff7dd4b774d05150474b9603`. Hasher and conversion mapping passed at SQLITE_HOST / HOST_FILESYSTEM. Remaining source gap named there: joined persistGrinOwnerSession → processAttachments → real httpsCallable was not executed (FAKE evidence for hasher durable; separate transport for emulator round-trip).

## Coordinator joined persist→emulator proof (unsent, 2026-10-02)

Merged T5 PHASE 3 onto combined. Extended `tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts` so one object goes through `persistGrinOwnerSession` → `processAttachments` → real Firebase JS `httpsCallable` against the isolated Functions emulator (hasher remains production APP_FILESYSTEM; SQLITE_HOST + HOST_FILESYSTEM injected). `npm run test:goods-evidence-g1-functions-emulator` passed. `functions/src/index.ts` HOLD. Live Rules unchanged. versionCode 23. Purchase-entry flags `"0"`. GRIN default-off. **Wave 2 not accepted** pending Team 5 re-execution of the joined SHA. Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 E1 joined persist PHASE 4 (unsent, 2026-10-02)

Independent follow-up `ee4be8aa460beb4b0a22c3ad6f559c13873e58dc` of combined `cd5b5f43702b65b7a06d50c56413d26369b6920e`. `npm run test:goods-evidence-g1-functions-emulator` independently re-executed: persistGrinOwnerSession → processAttachments → real `httpsCallable` (not mocked); hasher factory not injected; unset hosts failed as required. Labels: EMULATOR / SQLITE_HOST / HOST_FILESYSTEM / not NATIVE_DEVICE / not live deploy. `functions/src/index.ts` HOLD. versionCode 23. Purchase-entry flags `"0"`. GRIN default-off. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release Done.

## Local ci:verify after PHASE 4 board (unsent, 2026-10-02)

Local `npm run ci:verify` on `9050a1305fd4df2132db57f6494913b38d8e767d` (parent `ee4be8a`). `test:all` 152/152. G1/G2/Functions-emulator suites executed including joined persistGrinOwnerSession httpsCallable. **Local validation passed with Docker stage skipped.** GitHub Actions canonical run (renderer Docker) was not obtained (`gh` unauthenticated; workflow is `main` / PR-to-`main` / `workflow_dispatch` only). `functions/src/index.ts` HOLD. versionCode 23. Flags `"0"`. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release Done.

## File-IO + complete-pack closeout (unsent, 2026-10-05)

Application SHA `2cbacff6d21caae3d721127fb1a353e4c553be11` on `integration/grin-g1-g5-source` (parent `23cc0001daa6c9970bf60ed771c87cc5742904ab`). Production hashing/copy uses Expo SDK 54 `FileHandle.readBytes` at 64 KiB with running size limits; avoidable full-file base64/`readAsStringAsync` path removed from GRIN originals. Upload still hands an Expo `File` Blob to `uploadBytesResumable` (15 MiB PDF / 10 MiB image / 2 concurrent) — **not** device peak-memory proof. Joined `pack-complete.emulator.test.ts` covers persist → attach labelled synthetic originals → real `httpsCallable`/Storage emulator → `writeEvidenceUpload` → SQLite reopen → `exportPack` (manifest/PDF summary, `originalsBundled=false`, ITC `not_determined`). `markVerifiedDescriptor` remains a labelled SQLITE_HOST unit only. Packets A–E undeployed under `docs/release/packets/`. Encrypted PDF backup remains backlog. versionCode 23 is not reserved. Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 file-IO + complete-pack review (unsent, 2026-10-05)

Independent QA of application SHA `2cbacff6d21caae3d721127fb1a353e4c553be11`; docs commit `a81c6b4b86909f795a20eafcb5b36321dcd97f5d`. Executed instrumented FileHandle `boundedRead.test.ts`, isolation contracts, SQLITE_HOST repository unit, unset-host failure, and `pack-complete` Functions emulator. File-IO/pack **source gaps closed at labelled hosts only**. NATIVE_DEVICE / upload RSS-PSS **pending**. `functions/src/index.ts` HOLD. Live Rules unchanged. Store-runtime block unchanged. versionCode 23. Purchase-entry flags `"0"`. Legal date `2026-07-27`. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release Done.

## Local ci:verify after file-IO/pack closeout (unsent, 2026-10-05)

Local `npm run ci:verify` on application SHA `2cbacff6d21caae3d721127fb1a353e4c553be11` (tested checkout parent `23cc0001daa6c9970bf60ed771c87cc5742904ab`). `test:all` 152/152 in 335.7s. `test:goods-evidence-g1-functions-emulator` included `pack-complete.emulator.test.ts`. Elapsed 522401 ms, exit 0. **Local validation passed with Docker stage skipped** (`docker not available locally; GitHub Actions CI will run the renderer image build`). GitHub Actions canonical run (renderer Docker) was not obtained (`gh auth status`: not logged into any GitHub hosts; workflow `CI` is `main` / PR-to-`main` / `workflow_dispatch` only). No existing combined PR could be listed. Draft PR not created. Compare: https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source . `functions/src/index.ts` HOLD. versionCode 23. Flags `"0"`. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release Done.

## Post-upload confirmation refresh (unsent, 2026-10-05)

Application SHA `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` (parent `d55a53cb33b8a5e170986f8af9c1f2f6ebf5091e`). After durable originals, `processAttachments` calls `readValidatedConfirmation` and persists via existing monotonic upsert. Failed reads stay `attachment_pending` without reissuing or dropping local files. `pack-complete.emulator.test.ts` no longer calls `persistConfirmedProjection`. Packets A/B: export `grinBeginEvidenceUpload`; Internal Testing artifact is a production-profile AAB; APK is a separate device-test artifact; no in-app Play-track signal; store-runtime block unchanged. Do not mark GRIN / G6 / billing / public-release Done.

## Team 5 confirmation-refresh review (unsent, 2026-10-05)

Independent QA of application SHA `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`; docs commit `1d5ab2fc60dedd49584993c20936e1a1a22c1fc8`. SQLITE_HOST + unassisted pack-complete emulator executed. Unset hosts failed as required. **Wave 2 not accepted.** NATIVE_DEVICE / upload memory / policy / Play remain open.

## Local ci:verify after confirmation refresh (unsent, 2026-10-05)

Local `npm run ci:verify` on application SHA `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`. `test:all` 152/152 in 289.2s. pack-complete included. Elapsed 459288 ms, exit 0. **Local validation passed with Docker stage skipped.** GitHub Actions canonical run (renderer Docker) was not obtained (`gh` unauthenticated; ChatGPT connector draft-PR HTTP 403 “Resource not accessible by integration.”). Compare: https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source . Do not mark GRIN / G6 / billing / public-release Done.

## Release candidate packets (unsent, 2026-10-05)

Operational packets under `docs/release/packets/` (A backend proposal, B Internal AAB, C device checklist, D owner options with recommendations, E billing/public, T2 device-upload, Play listing worksheet, secret scan, coordinator A–G). Finite checklist `docs/release/GRIN_CLOSURE_CHECKLIST.md`. Team 5 independent gate: `docs/release/proposals/team5/RELEASE_CANDIDATE_GATE_REVIEW.md` (RC-01…RC-11; Wave 2 not accepted; SQLITE_HOST/emulator not re-run this session). Combined still `integration/grin-g1-g5-source`. Application SHA `dcc325a`. Published head at packet start `7411940`. No combined PR (`gh` still unauthenticated; GitHub search empty; Actions `total_count` 0 on the branch). **Not a live Jira update.** Source completion does not close device, deployment, or billing tickets. Do not mark GRIN / G6 / billing / public-release Done.

## Production packaging (unsent, 2026-10-05)

Application SHA `84c748d026d4229cded55d3ddc281a15858322c9` on `integration/grin-g1-g5-source`. Production Admin compose under `functions/src/goodsEvidence/productionCompose.ts`; isolated Functions emulator re-exports it; G1/G2 packaged with drift checks. `functions/src/index.ts` still has no GRIN export. Isolated emulator suite (roundtrip + pack-complete + production gates) passed. Owner draft PR #31 exists. Canonical Actions `ci:verify` succeeded on packet head `ba32337` (run `37309701455`, job `111761813010`) — **not** on `84c748d` until owner push. Live Rules re-export blocked (`firebase login --reauth`). Packet B visibility unapplied. Wave 2 **not accepted**. Do not mark GRIN / G6 / billing / public-release / device Done.

## Operational preflight packet (unsent, 2026-10-05)

Application SHA `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` on `integration/grin-g1-g5-source` (draft PR #31). Canonical CI run `37351685421` job `111903806888` `ci:verify` success. Do not reuse failed run `37344993645`. Packet `INTERNAL_GRIN_DEPLOYMENT_PACKET.md` now uses firebase-tools 14.20.0 seven-function **redeploy** + ephemeral dotenv for enable/disable; bare `gcloud functions deploy --update-env-vars` is not the method. Isolated Rules config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` (repo `firebase.json` unchanged). Live Firebase `projects:list` still 401 — owner `firebase login --reauth` once; not retried. No live deploy, Rules/IAM/env write, tester seed, EAS, Play, billing, or `main` merge. versionCode 23. Purchase-entry / quota-upsell `"0"`. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release / device Done.

## Command-safety + live preflight (unsent, 2026-10-06)

Application SHA still `5d5df3d`. Guarded tool `docs/release/packets/grin-ops/grin-functions-op.mjs`; stub tests 15/15. Firebase dotenv enable/disable **blocked** (replace semantics). Alternative: per-function `gcloud functions deploy --update-env-vars` without `--source` after GCS/repo origin check. Live inspect: project `982505811909`; bucket belongs; all seven GRIN functions **absent**; runtime SA default compute `roles/editor`; Firestore/Storage hashes match approved baseline; rollback export `docs/release/rules-compat/live-export-2026-10-06/`. No live deploy, env write, Rules/IAM change, tester seed, EAS, Play, billing, or `main` merge. **Wave 2 not accepted.** Do not mark GRIN / G6 / billing / public-release / device Done.

## Ops-guard correction (unsent, 2026-10-06)

Tooling SHA `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`. Ops tests **34/34** (not application CI). Fail-closed inspect: 403/incomplete ≠ absent. Live mode rejects fixtures/pin/hang. Application SHA unchanged `5d5df3d`. Draft PR #31. Do not mark GRIN / device / billing / public-release Done.

## Five-team release completion start (unsent, 2026-10-06)

Coordinator register `docs/release/RELEASE_COMPLETION_REGISTER.md`. Application `5d5df3d` / CI `37351685421`. Tooling `228a8f5`. Refreshed inspect: GRIN seven still ABSENT, inventory complete, Rules hashes still baseline. Approval packets A–D prepared; **no** live mutation, EAS, Play upload, billing activation, or `main` merge. Owner policy sheet still blank (pricing/quota/retention). Device and live-store billing **NOT RUN**. Next offer: isolated Firestore Rules only (A1). **Wave 2 not accepted.** Do not mark GRIN / G6 / device / billing / public-release Done.

## Owner policies recorded (unsent, 2026-10-06)

Owner wrote: GRIN included in existing Starter/Professional/Business (no separate SKU); one new issuance consumes one monthly record allowance; proposed storage 1/5/20 GiB pending economics; warn 80/95 refuse at cap; no silent delete; expiry 90-day read then 30-day notice; explicit deletion requested 180 days vs implemented 15 days vs public-approved UNRESOLVED. Source implementation authorized; **no** live deploy/billing/Play. Testers: owner+two, identities not supplied. Synthetic GRIN until lifecycle implemented. Artwork `store/play-icon-512.png` and feature graphic **are git-tracked**. `/~flock.js` is Tinybird with first-party `/~api/analytics` proxy (POST 202). Do not mark device/billing/public Done. Next offer still A1 isolated Firestore Rules.

## Team 5 policy QA (unsent, 2026-10-06)

Independent QA on application `5d5df3d` (Team 2 unmerged, not reviewed). Ops-guard **34/34 TOOLING** (not application CI). Public deletion/retention **SOURCE FAIL** (P8): GRIN still absent from purge prefixes; nested ledger children would remain even if first-level names were appended; **180 requested does not close**. Issuance monthly allowance **SOURCE FAIL for public GRIN** (P3): register does not increment `recordsThisMonth`. Artwork hashes independently **PASS** (git-tracked). Expected-FAIL regressions live under `docs/release/proposals/team5/` (not `ci:verify`). Do not mark GRIN / device / billing / public-release Done.

## Team 3 Android / device (unsent, 2026-10-06)

Play uploaded-version inventory **NOT RUN**: `support.vyd` Play Console ToS not accepted; `aeadmin` “Too many failed attempts”; Firebase token not used as Publisher. EAS (`npx eas-cli@16.28.0`): no `internal-grin`, no git `5d5df3d`, highest vc22 `72cb7254` production AAB git `0da2f58` — not this SHA. vc23 unreserved. Device sheet all executable rows **NOT RUN** (`adb` empty). B1 build ≠ B2 upload; neither granted. Artwork tracked in candidate tree. Do not mark device / Internal build Done.

## Team 4 billing / Play (unsent, 2026-10-06)

Integrated fail-closed `PLAY_BILLING_TESTER_UIDS` on prepare/validate **behind** `PLAY_BILLING_ENABLED` (empty list denies all). **Not enabled. Not deployed. No UIDs invented.** `npm run test:billing-play-constants` pass; `test:billing-google-play` pass. Do **not** cite CI `37351685421` for this tree. Live handlers still only the absent enablement key. Play catalog **NOT RUN**. Listing: pre-complete email/profile; do not advertise unreachable GRIN; diary amounts/credit/payment are financial data; flock.js first-party POST 202; keep **15-day** deletion, do not ship 180-day pending as Play deletion. Do not mark billing / public-release Done.

## Team 1 backend (unsent, 2026-10-06)

Folded slice `88d8c8b` as combined `086aa73`. Auth GAP tests re-run on combined: ops-guard+planner **43/43**; injected unit **ok**; `test:goods-evidence-g1-functions-emulator` **exit 0**. A1 isolated Firestore Rules still independently offerable. Mixed-state create-absent-only planner **not wired**. gcloud enable/disable **UNPROVEN**. GRIN seven still **ABSENT**. Do not deploy. Do not mark backend/GRIN Done.

## Team 2 quota / lifecycle (unsent, 2026-10-06)

Folded slice `14e56f3` onto combined. First GRIN register consumes one monthly slot in the Admin transaction; mutate/evidence/reconcile do not. Storage 1/5/20 GiB labelled `PROPOSED_PENDING_OWNER_CONFIRMATION` — **do not advertise**; alternative **256 MiB / 1 GiB / 5 GiB**. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. `DELETION_GRACE_MS` 15 days unchanged. Focused INJECTED tests + G1/G2/functions emulators **exit 0**. Issuance SOURCE lock **PASS**. Public deletion SOURCE **FAIL** (P8). Local `ci:verify` **PASS** on `7761af6` (`test:all` 159/159; invoice-renderer Docker skipped). Do **not** cite CI `37351685421`. Do not deploy. Do not mark GRIN / deletion / public-release Done.

## Team 5 independent T2 QA (unsent, 2026-10-06)

Reviewed application `b845e8a` (`POLICY_QA_T2.md`, team commit `365f9f3`). **P3 PASS** on the production register transaction (INJECTED, not only the string scan). **P8 FAIL** unchanged (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`; default prefixes omit GRIN). No new blockers. GiB still pending owner confirmation. Device / Play / live **NOT RUN**. Do not mark GRIN / device / billing / public-release Done.

## Checkpoint 41b05a4 / GHA 37379529193 (unsent, 2026-10-06)

PR #31 head `41b05a49e8e60597b63a35f22825878bc1945dee` matches this checkout. GitHub Actions run **`37379529193`** job **`111997702708`** verify/canonical CI **success**. `7761af6`→`41b05a4` includes Team 5 QA files and a `package.json` test script — not exclusively narrative. Open **S1** (corrupt accounting can bypass storage cap) and **S2** (hold key omits ledgerId). P3 remains accepted. P8 remains FAIL. Do not cite `37351685421` for this tree. Do not mark GRIN / device / billing / public-release Done.

## Team 1 A1 refresh (unsent, 2026-10-06)

Packet `docs/release/proposals/team1/A1_PACKET_REFRESH.md` (team `3efd762`). Isolated Firestore Rules still independently offerable (`firebase.rules-only.json --only firestore:rules`). Live baseline `b13d5255…`; proposed merged `551203b8…`; config `d224b753…`. Functions pin `5d5df3d` **STALE** vs `b845e8a`; A3 waits for reviewed pin **after S1/S2** — do not pin `b845e8a`, do not env-override. Ops-guard remains `228a8f5` 34/34. No live deploy. Do not mark backend/GRIN Done.

## Team 4 15 vs 180 owner sheet (unsent, 2026-10-06)

`docs/release/proposals/team4/DELETION_15_VS_180_OWNER_SHEET.md` (team `ec4a03d`). Three facts: implemented **15 days**; owner requested **180 days**; public-approved policy **UNRESOLVED**. Play-risk framing: do not ship 180-day pending as deletion; do not treat 15 as the recorded owner choice; do not substitute 30. Catalog **NOT RUN**. P8 remains open. No website publish. Do not mark billing / public-release Done.

## Team 5 S1/S2 pre-fix reproduction (unsent, 2026-10-06)

`docs/release/proposals/team5/S1_S2_PRE_FIX.md` (team `4c1e8a7`). Application blobs still `b845e8a`. Real G2 `reserve` against injected persistence: **S1 FAIL** — four malformed/inconsistent `retainedOriginalBytes` cases admitted over cap (charged **1100**, writes +4). **S2 FAIL** — same owner, two owned ledgers, same `evidenceId`: two evidence docs, one hold `original:ev_s2_shared`, charged **200 not 450**. Helper admit is not sole proof. Existing `storageQuota.injected.unit.test.ts` exit 0 does not cover S1/S2. **P3 ACCEPTED** (unchanged). **P8 FAIL** (unchanged). EMULATOR / device / live / billing / public **NOT RUN**. **WAITING_FOR_FIX.** Do not mark GRIN / device / billing / public-release Done.

## Team 3 Internal AAB packet (unsent, 2026-10-06)

`docs/release/proposals/team3/APPROVAL_B_DRAFT.md` + `DEVICE_HANDOFF.md` (team `7bdf375`). Play App bundle explorer **RUN** 2026-10-06 (read-only): highest uploaded **vc22**; 23/21/18 absent; Internal **Active Vc22**. versionCode **23 UNRESERVED**. Freeze SHA candidate `520f9f9` **only after** matching canonical CI (do not reuse CI `37379529193`). Identities blank. `adb devices` empty. No EAS/native/Play write. B1≠B2, neither granted. Do not mark device / Internal Testing Done.

## Team 2 S1/S2 fold (unsent, 2026-10-06)

Cherry-pick of `0cd3473` (`team/grin-t2-s1s2`) onto combined as `520f9f98bc952fd7f30a907da9e85774629a69c0`. Pre-fix (`b845e8a`): S1 admitted charged 1100/1000; S2 one hold `original:{evidenceId}`. Post-fix: `quota_state_invalid` zero writes on corrupt docs; holds `1.o.{len}.{ledgerId}.{len}.{evidenceId}`; `MAX_STORAGE_HOLDS=2500`. Coordinator focused tests PASS. Canonical GHA **NOT YET** for this SHA. Do not cite `37379529193`. Pin `5d5df3d` still STALE — do not pin until T1 review; no env-override. Bucket location UNKNOWN. Do not advertise 1/5/20 GiB. P8 open (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`). No deploy. Do not mark GRIN / device / billing / public-release Done.

## Team 5 S1/S2 post-fix (unsent, 2026-10-06)

`docs/release/proposals/team5/S1_S2_POST_FIX.md` (team `1e33894`). Application `520f9f9` / combined HEAD at review `1ca33d6`. **S1 PASS** / **S2 PASS** at INJECTED + named G2 EMULATOR `127.0.0.1:8091` / `9200` project `demo-vyaamikk-grin-g2`. Corrupt counters: `quota_state_invalid`, zero writes. Two ledgers charged **450** with distinct `1.o.{len}.{ledgerId}.{len}.{evidenceId}` holds. Replay once; other owner isolated; conflict fail-closed; contention 600/1000. **P3 ACCEPTED**. **P8 FAIL**. Confirmation-refresh / immutable-original not reopened. Canonical GHA / NATIVE_DEVICE / LIVE_BACKEND / billing / public **NOT RUN**. Do not cite `37379529193` for `520f9f9`. Do not mark GRIN / device / billing / public-release Done.

## Team 1 REVIEW_AFTER_S1_S2 + pin apply (unsent, 2026-10-06 — historical)

`docs/release/proposals/team1/REVIEW_AFTER_S1_S2.md` (team `80b802f`). SOURCE PASS / TOOLING PASS at `520f9f9`. Coordinator then applied `PINNED_APP_SHA=520f9f9` at `0d7aa17`. Statements in this paragraph that canonical GHA was “NOT YET” are **superseded** by run `37425360211`. Do not mark backend / GRIN Done.

## Closeout 0d7aa17 / GHA 37425360211 (unsent, 2026-10-06)

Published PR #31 head `0d7aa17`. Application `520f9f9`. Tooling successor `0d7aa17` (helper pin constant only vs historical ops-guard `228a8f5`; not byte-identical). Independently observed GHA run **`37425360211`** job **`112143748428`** verify + canonical gate **success**; skipped none observed. S1/S2 closed at INJECTED+EMULATOR. P3 accepted. P8 open. Device/live/billing/public not accepted. A1 isolated Firestore Rules **offerable, not executed**. Do not mark GRIN / device / billing / public-release Done.

## Team 3 Internal AAB freeze (unsent, 2026-10-06)

`docs/release/proposals/team3/APPROVAL_B_DRAFT.md` + `OWNER_DEVICE_FORM.md` (team `8ca2b59` on `team/grin-t3-freeze`). Freeze application **`520f9f9`** with canonical CI **`37425360211`** (head `0d7aa17`). B1 ≠ B2; **neither granted**. versionCode **23 UNRESERVED**. Re-read Play explorer before B1. Testers/phones blank; `adb` empty → **NOT RUN**. No EAS/Play write. Do not mark device / Internal Testing Done.

## Team 5 pin/CI closeout (unsent, 2026-10-06)

`docs/release/proposals/team5/CLOSEOUT_0d7aa17.md` (team `00fd822`). TOOLING **34/34** + SOURCE CI PASS at `0d7aa17` / GHA **`37425360211`**. S1/S2 not reopened. **P3 ACCEPTED**. **P8 FAIL**. Device/live/billing **NOT RUN**. Dirty leftover POLICY_QA files **not folded**. Do not mark GRIN / device / billing / public-release Done.

## Team 1 A1 present (unsent, 2026-10-06)

`docs/release/proposals/team1/A1_PRESENT.md` + `A2_A7_REMAINING.md` (team `80da828` on `team/grin-t1-a1-present`). Isolated Firestore Rules hashes re-verified. Live baseline preserved. **Not executed.** A2–A7 remain separate HOLDs. Do not mark backend / GRIN Done.

## Team 2 capacity / inactive cleanup fold (unsent, 2026-10-06)

Cherry-pick of `2cebe32` (`team/grin-t2-capacity`) onto combined as `56f2040e30159579edc0cbfbc88e2ba706a6abd2`. `MAX_STORAGE_HOLDS=2500` remains a technical limit; 15 MiB-PDF fill of proposed 20 GiB not blocked; derivative fill of 20 GiB cannot fit one Firestore document (no integer raise; no redesign). Bucket location **UNKNOWN**. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. `DELETION_GRACE_MS` 15 days. Cleanup is **not** an operational deletion service. **P8 FAIL**. Helper pin remains `520f9f9` — **STALE vs `56f2040`**; do not env-override; A3 HOLD. Canonical GHA **`37425360211` does not cover `56f2040`**. Internal freeze candidate remains `520f9f9`. Coordinator local tests PASS (storageQuota unit+injected, grinCleanup unit, quota injected, g2 unit, entitlement lifecycle). Do not mark GRIN / device / billing / public-release Done.

## Team 4 two owner decisions (unsent, 2026-10-06)

`docs/release/proposals/team4/TWO_OWNER_DECISIONS.md` + `STORAGE_OWNER_CHOICE.md` + refreshed deletion sheet (team `7e4ed20` on `team/grin-t4-product`). T4 recorded combined `aea65c1` / application `520f9f9` as its checkout — **historical**; current application is `56f2040` (T2 already folded; not re-cherry-picked). Deletion: 15 implemented / 180 requested / public UNRESOLVED; A–D blank; freeze ≠ delete. Storage: 1/5/20 vs 256 MiB/1/5 GiB; one write; neither advertised. Catalog **NOT RUN**. Purchase-entry `"0"`. No activation/Save/submit. Do not mark billing / public-release Done.

## Team 3 freeze vs current HEAD (unsent, 2026-10-06)

`docs/release/proposals/team3/CURRENT_HEAD_VS_FREEZE.md` (team `d4a8197` on `team/grin-t3-freeze`). Freeze remains **`520f9f9`** + GHA **`37425360211`**. Current application **`56f2040` is not the freeze.** T3 observed combined docs HEAD `28182c2` — **historical**; later T4 docs fold is `09452a9`; application blobs still `56f2040`. B1 ≠ B2; **neither granted**. Do not build `56f2040` under the `520f9f9` packet. No EAS/Play write. Do not mark device / Internal Testing Done.

