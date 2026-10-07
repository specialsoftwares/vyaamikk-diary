# Release-candidate gate review (Team 5)

AI QA / release-gate role, not human certification. Coordinator narrative,
`docs/release/packets/RELEASE_CANDIDATE_2026-10-05.md`, and
`DRAFT_COMBINED_PR.md` were **not** treated as evidence. Source, packet files
named in this review, and prior Team 5 labelled-host records were read in
`/Users/shivamsaurav/vyd-worktrees/grin-combined` on branch
`integration/grin-g1-g5-source`. Historical workspace
`/Users/shivamsaurav/Vyaamikk Diary` was not opened for edits.

**Wave 2 is not accepted.** G6 is not closed. Forbidden matrix statuses
(`complete` / `accepted` / `pass` / `done` / `approved`) are unused here as
Wave 2 / G6 / public-release closure.

This session **did not** re-run SQLITE_HOST `outbox.sqliteHost.test.ts` or
Functions-emulator `pack-complete.emulator.test.ts`. Confirmation-refresh
behaviour is taken from **source inspection at `dcc325a`** plus the prior
independent Team 5 record
`docs/release/proposals/team5/WAVE2EVIDENCE_CONFIRMATION_REFRESH.md` (labelled
SQLITE_HOST + EMULATOR at that SHA). That prior run is not a new execution.
ChatGPT extracted-method injection is not emulator or device evidence.

No production files, flags, Rules, Functions exports, EAS, Play, or main
merge. `functions/src/index.ts`, `firestore.rules`, and `storage.rules` were
read only. Confirmation-refresh and FileHandle source fixes were **not
reopened** (no new reproduction).

## A. Verified SHAs actually inspected

| Role | Full SHA | How verified |
|---|---|---|
| Application under review | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` | `git rev-parse` + `git show`; `fix(grin): refresh confirmed projection after evidence linkage` |
| Published combined HEAD (docs after application) | `741194009a41af7870a6b2a856ad2f226d0e697d` | `git rev-parse HEAD` at inspection; docs-only after `dcc325a` |
| `origin/main` / merge-base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` | `git rev-parse origin/main`; `git merge-base HEAD origin/main` |
| Parent of application SHA | `d55a53cb33b8a5e170986f8af9c1f2f6ebf5091e` | `git log -1` parent of `dcc325a` (docs) |
| Preserved FileHandle / pack application (do not reopen) | `2cbacff6d21caae3d721127fb1a353e4c553be11` | `git merge-base --is-ancestor` true vs `dcc325a` |
| Secret-scan hit commit | `3ddd4f96d5c85d6f21a8cf2ccfb8a043d9e25c31` | `git grep G2AdmissionGate` at that commit |

`git diff dcc325a HEAD -- ':!docs/' ':!*.md'` is empty: application tree at
published HEAD **matches** `dcc325a`. Later commits `1d5ab2f` and `7411940`
are documentation only. Working-tree application files listed in §C still
match `dcc325a` (`git diff dcc325a --` those paths empty).

Packets reviewed from the **working tree** (uncommitted at inspection):
`docs/release/packets/A_GRIN_BACKEND_EXPORTS_UNDEPLOYED.md`,
`B_INTERNAL_TESTING_ADMISSION.md`, `C_DEVICE_CHECKLIST.md`,
`D_OWNER_POLICY_OPTIONS.md`, `E_BILLING_LATER.md`,
`T2_DEVICE_UPLOAD_READINESS.md`, `PLAY_LISTING_DATA_SAFETY_REVIEWER.md`,
`SECRET_SCAN_2026-10-05.md`, and `docs/release/GRIN_CLOSURE_CHECKLIST.md`.

Evidence labels used below: `source`, `injected`, `SQLITE_HOST`, `emulator`,
`native device`, `play-installed`. This session’s new work is **source**
(plus `gh` / gitleaks-report inspection). No `native device` or
`play-installed` run.

## D. Verdict

Wave 2 **is not accepted.** No new source reproduction was found that would
reopen confirmation-refresh or FileHandle. Individual source greens in §C do
**not** close Wave 2, G6, Internal Testing admission, or public release.

## C. Source items with no remaining source blocker (reviewed scope)

These are closed **as source** on `dcc325a`. They are not device, deployment,
or Wave 2 acceptance.

| Item | Why no source blocker remains | Label |
|---|---|---|
| Post-upload confirmation refresh | `processAttachments` awaits `readValidatedConfirmation` after durables; failed/null parse stays `attachment_pending` with `lastErrorCode` `confirmation_refresh`; durables and issued number are not cleared; `confirmed == null` skips `upsertConfirmedProjection`; `skipStaleCompletion` runs before and after the read; completion write is inside `withTransactionSync` and rechecks session/attempt. Production JS transport implements `readReceipt`. | `source` (this session). Prior T5 SQLITE_HOST + EMULATOR at `dcc325a` preserved; **not re-executed here**. |
| Parse / monotonic upsert | `parseConfirmedProjection` copies `raw.eventVersion`; does not invent original/events/effective. `upsertConfirmedProjection` no-ops when current version `>=` incoming. | `source` |
| Bounded original reads | `iterateBoundedChunks` uses injected `FileHandle.readBytes` at `HASH_CHUNK_BYTES` (64 KiB), copies each chunk, running `maxBytes`, closes in `finally`. Production `createFirebaseJsGrinEvidenceTransport` omits `readLocalBytes`. No `readAsStringAsync` / `atob` in `evidenceTransport.ts`. | `source`. Not native RSS/PSS. FileHandle not reopened. |
| Fail-closed unexported callables | `functions/src/index.ts` (80 lines) has no `goodsEvidence` / GRIN export. `callables.ts` handlers deny unless env is exactly `"true"`, and still deny without an injected adapter. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry`. | `source` HOLD by design, not a client defect |
| Callable names | Client and Functions constants are `grinBeginEvidenceUpload` (`GRIN_BEGIN_EVIDENCE_CALLABLE`). Seven names match Packet A. No `grinBeginEvidence` export in application source. | `source` |
| GRIN default-off + store-runtime block | `isGoodsEvidenceBlockedByStoreRuntime()` is `env.runtimeKind === "store-or-standalone"`. `isGoodsEvidenceEnabled()` returns false **before** reading `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. `eas.json` production/preview do not set that env. `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` is **absent** from the application tree. | `source` |
| Purchase-entry / quota-upsell | EAS production and preview set both to `"0"`. Client gates require `=== "1"`. Development EAS profiles leave them unset (still not `"1"`). | `source` |
| `app.json` version | `expo.version` `1.0.0`; `android.versionCode` `23`. `app.config.js` only remaps `googleServicesFile`. | `source`. 23 is **not** a Play reservation. |
| Pack summary / ITC | Repository pack types and assembler keep `originalsBundled: false` and `itcDisposition: "not_determined"`. | `source` (prior pack-complete EMULATOR not re-run) |
| Legal date | `LEGAL_EFFECTIVE_DATE` `2026-07-27`. | `source` |
| Technical ceilings | 15 MiB PDF, 10 MiB image, 2 concurrent uploads per owner, in `src/goodsEvidence/evidence.ts`. | `source`. Not OOM-free device proof. |
| SQLite v10 | `DB_VERSION = 10`. | `source`. Upgrade behaviour on vc22 devices is a **device** gate. |
| Secret-scan identifier | `G2AdmissionGate` is a TypeScript union type, not a credential (see §F). | `source` |

Intentional residuals that stay **non-blockers for source**:

- INJECTED ports without `readReceipt` skip post-evidence refresh (`canRefresh` false → `issued`). Production factory uses `createFirebaseJsGrinTransport`, which implements `readReceipt`.
- Host pack `putObject` in emulator tests still `readFile`s retained bytes — `HOST_FILESYSTEM`, not production `FileHandle`.
- SQLITE_HOST confirmation tests (prior T5) assert pending + durable + single serial; they do not assert the `confirmation_refresh` string. Production sets that code.
- Encrypted PDF backup remains backlog. Not turned into a release blocker.

## B. Remaining blockers

Not every future enhancement. Only gaps that currently block a named gate.

| ID | Concrete failure or missing evidence | Affected user behaviour | Smallest corrective action | Owner | Required gate |
|---|---|---|---|---|---|
| RC-01 | No production Admin compose: `productionCompose.ts` does not exist; G1/G2 adapters live under `tools/`. `functions/src` must not import `tools/`. Current `handleGrin*` stubs always `policy_denied` even if env is `"true"`. | Live `httpsCallable` GRIN register/upload cannot succeed. Testers would queue locally and fail closed / stay non-durable. | Copy/generate adapters under `functions/src`, add production compose (Admin Firestore+Storage), then export seven `onCall` wrappers from `functions/src/index.ts` under a **later** owner authorization. Do not export stubs as a “working” backend. | Team 1 + coordinator (owner authorize deploy) | **deployment** |
| RC-02 | `functions/src/index.ts` still has no GRIN exports. Isolated emulator handlers are not the production entry. | Same as RC-01 against live Firebase. | Authorized Functions deploy **after** RC-01 compose exists. Env `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` only on those seven instances. | Team 1 + owner | **deployment** |
| RC-03 | Last live Rules export on disk is `docs/release/rules-compat/live-export-2026-10-01/META.json` (2026-10-01T14:04Z). Independently hashed: repo-root `firestore.rules` `233b05b7…d58cc` (quota candidate); repo-root `storage.rules` `19fcc761…a60452`; proposed live-compat Firestore `b13d5255…a25e2c`; proposed Storage `1a912051…717d5`. Repo-root and proposed live-compat files contain **no** `goodsEvidence` / `grinEvidence` matchers. This session did **not** re-export live GCP. | Client SDK cannot create/read GRIN Storage originals or GRIN Firestore docs under live Rules even after Functions exist. Risk of deploying quota `firestore.rules` by mistake (`firebase.json` still points at repo root). | Re-export live Rules; abort on hash drift; merge GRIN matchers into **that live** source (not repo-root quota Firestore); emulator-test; deploy Rules only after owner approval. | Coordinator + owner (Team 1 matcher source) | **deployment** |
| RC-04 | Tester admission documents are not seeded (HOLD). Packet A path `users/{uid}/goodsEvidenceAdmission/runtime` is proposal-only. | Non-seeded Auth uids must deny. Until RC-01–RC-03 exist this is latent. After deploy, every uid without a seed is blocked — correct — but named Internal testers also cannot register until seeded. | Admin-seed only named tester uids. Do not treat `EXPO_PUBLIC_*` or Play licence-tester email as admission. | Owner (list) + Team 1/ops | **deployment** |
| RC-05 | No production-profile AAB has been built from `dcc325a` (EAS HOLD). `eas.json` `build.production.android.buildType` is `app-bundle`; preview/development are `apk`. | Testers cannot install a Play Internal Testing candidate of this SHA. A sideload APK is a different artifact class. | Owner-authorized `eas build --profile production` from a clean tagged SHA **after** versionCode inventory (RC-06). Do not upload a preview APK to Internal Testing. | Owner / release | **build** |
| RC-06 | `app.json` `versionCode` 23 is source only. Last Play inventory cited in Packet B is **2026-10-01** (Internal vc22 Active; 23 absent). This session did not read Play Console. 23 is **not reserved**. | Duplicate versionCode upload would be rejected; using a now-taken 23 would fail Play. | Owner re-reads complete bundle list immediately before choosing a code strictly greater than the highest uploaded. Write that integer into `app.json` immediately before the authorized build. | Owner | **build** |
| RC-07 | Store-runtime block is still unconditional. Packet B §2 admit flag is **proposal only** (`EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` absent in application source). There is **no** in-app Play-track / installer detector. | Play-installed / release binaries hide GRIN even if `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. Internal testers on a production-profile AAB **cannot see** GRIN until a later visibility patch **and** RC-04. Diary Save/PDF still available. | If the Internal candidate must show GRIN: apply Packet B §2 on that production AAB only, keep purchase-entry `"0"`, keep isolation tests that store-runtime stays blocked **without** the admit flag. If GRIN must stay hidden, do not apply §2 and do not claim GRIN in listing copy. | Team 4/client + owner | **build** |
| RC-08 | Packet C and Team 2 U-01…U-10 are unexecuted. `tools/grin-acceptance/device/*.sh` still `device_pending` / exit 2. No attached phone in this environment. | Unknown: 15 MiB PDF / 10 MiB image / camera / process-death / TalkBack / locales / vc22→v10 upgrade / Play-installed upload. Expo `File` + `uploadBytesResumable` is not peak-memory proof. | Owner or named tester runs Packet C + `T2_DEVICE_UPLOAD_READINESS.md` on labelled `NATIVE_DEVICE` / `PLAY_INSTALLED` artifacts. Synthetic files only. | Owner / named tester (Team 2 cases) | **device** (and **play-installed** for Play AAB rows) |
| RC-09 | Canonical GitHub `ci:verify` is absent for this branch. See §G. | Merge/public confidence: renderer Docker + joined GRIN emulators have not run on GitHub Actions for `integration/grin-g1-g5-source`. Does not by itself break a tester device. | Open a PR to `main` **or** `workflow_dispatch` after auth; do not treat local Docker-skipped `ci:verify` as this row. | Coordinator / owner | **source** / CI (process). Not a product UI defect. |
| RC-10 | Packet D: pricing, storage quota option B, and retention A/B are **not recorded**. `functions/src/deletion` has no `grinEvidence` / `goodsEvidence` purge. | Public store users could accumulate originals with no deletion story and no commercial cap. Internal Testing can proceed only as invite-only with a wipe warning (Packet D recommendation C) if the owner accepts cost risk. | Written owner choice. Public GRIN stays blocked until pricing A or B, quota B (or written residual), and retention A or B **implemented**. | Owner (counsel as they choose) | **public release** (retention implementation also **deployment** when chosen) |
| RC-11 | Packet E billing / public production-track GRIN not started. Purchase-entry stays `"0"`. | No in-app GRIN SKU purchase; must not present GRIN as a general public feature. | Separate billing programme if Packet D chooses SKU B. Do not reuse `dcc325a` as billing acceptance. | Owner / billing | **billing** and **public release** |

Rollback without deleting serials/receipts/originals is documented in Packet A and **untested live** — not a current user-facing blocker until RC-02 is deployed.

## E. Packet A/B/C/D accuracy vs source

| Claim | Packet | Independent result |
|---|---|---|
| Callable name `grinBeginEvidenceUpload`, not `grinBeginEvidence` | A | **Accurate.** `callableNames.ts` and `functions/src/goodsEvidence/callables.ts`; emulator `handlers.ts` exports `grinBeginEvidenceUpload`. Application source has no `grinBeginEvidence` callable. |
| Seven names + `onCall` `{ region: "asia-south1" }` wrapping `request.auth.uid` | A | **Accurate** for the isolated emulator entry. Production `index.ts` does **not** export them (packet says unapplied). `canonicalFunctionsRegion(null)` is `asia-south1`. |
| Env gate exactly `"true"` | A | **Accurate.** `grinFunctionsEnabled` uses `=== "true"`. |
| Adapters under `tools/`; no `productionCompose.ts`; exporting current stubs would always `policy_denied` | A | **Accurate.** |
| Global options `cpu: gcf_gen1`, `concurrency: 1`, `maxInstances: 3` | A | **Accurate** (`functions/src/globalOptions.ts`). |
| Identity callables do not set `enforceAppCheck: true` | A | **Accurate** as absence: no `enforceAppCheck` in `functions/src`. |
| Live Rules vs repo-root quota Rules | A | **Accurate on disk hashes** (this session `shasum -a 256`). Packet A table matches. `firebase.json` still points at repo-root Rules — do not deploy those as the live GRIN merge base. **Not** a fresh live GCP export on 2026-10-05; packet already requires re-export before deploy. |
| Live has no GRIN matchers | A | **Accurate** for repo-root + proposed live-compat files inspected here. |
| Production Internal Testing artifact is AAB; preview APK is separate | B | **Accurate** (`eas.json`). |
| No trustworthy in-app Play-track signal | B | **Accurate.** No installer/track/channel security control in `src/` GRIN gates. Runtime kind is `store-or-standalone` vs Expo/dev-client, not Internal vs production track. |
| `versionCode` 23 not reserved | B | **Accurate as source.** Inventory date 2026-10-01 is stale until RC-06. |
| Store-runtime block; admit flag unapplied | B | **Accurate.** |
| `app.config.js` only remaps Google services files | B | **Accurate.** |
| Device checklist unexecuted | C | **Accurate.** Scripts still `device_pending`. |
| Owner pricing/quota/retention unset; deletion jobs do not purge GRIN | D | **Accurate** vs `functions/src/deletion` (no GRIN paths) and source ITC/`originalsBundled`. Recommendations are not source; they are not disputed here. |

Packet E purchase-entry `"0"` on production/preview: **accurate**. T2 FileHandle-at-`2cbacff` / confirmation-at-`dcc325a` preserve instructions: **accurate**; this review does not reopen them. Play listing worksheet: **accurate** that it is not submitted and that GRIN originals are not in the deletion job. Closure checklist S1–S6 vs S7–P5 split: **accurate** as a gate map; S1–S6 “closed at labelled hosts” includes prior T5 executions this session did not repeat.

Minor packet nits (not disputes of the operational claims):

- `SECRET_SCAN_2026-10-05.md` table “Commits scanned: 91” was **not** reproduced: `git rev-list --count 0da2f58..HEAD` is **119** at this HEAD (117 through `dcc325a`). Findings themselves confirmed in §F.
- That packet calls `G2AdmissionGate` a “policy-key constant”; it is a **type alias** used on `policyKey` parameters.

## F. Secret-scan

Packet claim: gitleaks **8.24.3**, range `0da2f58..HEAD`, 3 `generic-api-key` hits on identifier `G2AdmissionGate` in `tools/goods-evidence-storage/adapter.ts` at commit `3ddd4f9`, lines 1052 / 1146 / 1169.

**Confirmed, not disputed.**

- Binary `/tmp/gitleaks-8.24.3/gitleaks version` → `8.24.3`.
- Report `/tmp/gitleaks-grin-range.json`: exactly 3 findings, RuleID `generic-api-key`, File `tools/goods-evidence-storage/adapter.ts`, Commit `3ddd4f96d5c85d6f21a8cf2ccfb8a043d9e25c31`, StartLine 1052 / 1146 / 1169. Match text is the TypeScript identifier site (`policyKey: G2AdmissionGate`). Extracted token length 15 and identifier-shaped — consistent with the type name, not a key material blob.
- Source at `3ddd4f9`: those lines are type annotations `policyKey: G2AdmissionGate` (two with default `"newCommands"`, one parameter type). `types.ts` defines `G2AdmissionGate = "newCommands" \| "reconciliation" \| "retain"`.
- At `dcc325a` the same annotations exist at lines 1056 / 1150 / 1173 (drift from later inserts). Still a type name.

No token, service-account JSON, private key, OTP, or customer content is treated as a finding. This is not a clean-bill of the whole monorepo or of live GCP/EAS secrets. Leftover `/tmp/gitleaks-docs-release.json` is an empty findings array; this session did **not** re-run gitleaks over git or `docs/release/**`.

## G. Canonical CI

Independently verified in this environment:

- `gh auth status`: **not logged into any GitHub hosts.**
- `gh pr list --head integration/grin-g1-g5-source` and `gh api repos/specialsoftwares/vyaamikk-diary/actions/runs?branch=integration/grin-g1-g5-source&per_page=1` fail at login. **No combined GitHub PR can be listed. No Actions run list can be listed.** GitHub Actions `total_count` for this branch from this session is **0** (unauthenticated; no runs returned).
- Local `docs/release/packets/DRAFT_COMBINED_PR.md` is not a GitHub pull request.
- `.github/workflows/ci.yml` `on:` is `pull_request` to `main`, `push` to `main`, and `workflow_dispatch` only. A push to `integration/grin-g1-g5-source` does not start that workflow.
- `package.json` `ci:verify` includes `test:invoice-renderer-docker`. A **local Docker-skipped** `ci:verify` is **not** canonical CI.

RC-09 stays open.

## Confirmation-refresh (preserved; not reopened)

Source at `dcc325a` still matches the prior T5 contract:

1. Durables remain after confirmation failure (`writeEvidenceUpload(..., verified, true)` already happened; failed refresh does not un-verify).
2. Failed confirmation stays `attachment_pending` / `confirmation_refresh`.
3. Retry does not call register again (`serialsIssued` stay-1 was SQLITE_HOST in the prior T5 run; source path is `processAttachments` only).
4. Completion is after the confirmation `await` and inside the local transaction (`writeCommandAndReceipt` → `withTransactionSync` + session/attempt fence).
5. `pack-complete.emulator.test.ts` has **no** `persistConfirmedProjection` / `markVerifiedDescriptor` / `expectedVersion` rewrite on the success path (`rg` no matches this session). `failConfirmAfterUploadOnce` is a negative interrupt, not a stamp-to-complete helper.

No new source reproduction.

## What this review is not

- Wave 2 / G6 / public-release / billing admission
- A native-device or Play-installed run
- Authorization to deploy Functions, Rules, EAS, or Play
- A claim that local `ci:verify` (Docker-skipped or not) gates this SHA
