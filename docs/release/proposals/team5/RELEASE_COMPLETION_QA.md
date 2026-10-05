# Internal GRIN integrated release QA (Team 5)

AI QA / release-gate role, not human certification. Independent of the
implementation pass. **Wave 2 is not accepted.** Not live deploy. Not G6.
Not main merge. Not EAS/build. Not NATIVE_DEVICE. Not PLAY_INSTALLED.
`applyGcloudGateUpdate` is not real-deploy proof. A green source suite
is not native acceptance. A summary PDF is not original evidence.

Application SHA: `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
Tooling SHA / HEAD: `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`
Canonical application CI (coordinator-recorded; not re-fetched):
`37351685421` / `111903806888`. Do **not** attribute ops-guard tests to
application CI.

Ops-guard A/B at `228a8f5` is **not** reopened (no new reproduction).
Confirmation-refresh `dcc325a`, Admin config `4aac867`, Internal-GRIN
visibility `4409366` are **not** reopened.

Prior session inspected `/Users/shivamsaurav/vyd-worktrees/grin-combined`
on `integration/grin-g1-g5-source` (tree not edited). This continuation
worked only in `grin-t5-qa`. Application paths vs `5d5df3d` remain empty
on `functions src eas.json app.json app firebase.json`. Origin `main`
remains `0da2f58970f23c7ce6cbefae6efffd49c731f44b`.

## 2026-10-06 continuation

Independent re-run on `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`
`aa5253e`. Combined / historical dirty workspace **not** edited. No live
mutate. Policy review: `POLICY_QA.md`. Team 2 unmerged product code
**not reviewed** (same SHA, clean worktree).

### This session executed

| Check | Label | Result |
|---|---|---|
| `git diff --stat 5d5df3d -- functions src eas.json app.json app firebase.json` empty | SOURCE | **PASS** |
| `shasum -a 256 store/play-icon-512.png store/play-feature-graphic.png` + `git ls-files` | SOURCE | **PASS** — tracked; hashes match coordinator values |
| `unset GRIN_OPS_ALLOW_LIVE; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` | TOOLING (`228a8f5`; not application CI) | **34/34**. A/B not reopened |
| `npx tsx src/goodsEvidence/isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/goodsEvidence/featureFlag.test.ts` | SOURCE | exit **0** |
| `npx tsx functions/src/deletion/deletion.unit.test.ts` | SOURCE | exit **0** (diary purge; GRIN still absent) |
| `npx tsx tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | INJECTED | exit **0** |
| `npx tsx tools/goods-evidence-emulator/packaging.unit.test.ts` | INJECTED | exit **0**. Gate exact `"true"` |
| `npx tsx tools/goods-evidence-emulator/isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx tools/goods-evidence-storage/isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/services/grin/outbox/outbox.isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/services/grin/transport/isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx tools/grin-interop/isolation.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/boot/bootProductionStartup.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/billing/quotaUpsell/quotaUpsell.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/services/savedRecords/grinHubEntry.test.ts` | INJECTED | exit **0** |
| `npx tsx src/services/grin/repository/GrinApplicationRepository.test.ts` | SQLITE_HOST | exit **0**. `originalsBundled=false` |
| `node --test docs/release/proposals/team5/public-deletion-retention.regression.test.mjs` | SOURCE | **3 fail / 1 pass** (expected). GRIN not in purge; 180 not implemented |
| `node --test docs/release/proposals/team5/issuance-monthly-allowance.regression.test.mjs` | SOURCE | **1 fail / 2 pass** (expected). Register does not consume allowance |
| `test:live-rules-grin-merged` / G1/G2 Functions emulator | EMULATOR | **NOT RUN** |
| Live inspect / Functions / Rules / IAM / env / EAS / Play | LIVE_BACKEND | **NOT RUN** |

### Continuation verdict vs prior pass

Prior SOURCE PASS on cross-account, silent-alteration of register/verify,
duplicate serials, launch/sign-in/save/PDF wiring, ops pin, leakage, and
crash-on-render is **not** reopened. New evidence vs **approved-for-source**
owner policy:

| Priority | SOURCE this session | EMULATOR | LIVE_BACKEND |
|---|---|---|---|
| Cross-account access/writes | **PASS** (unchanged) | **NOT RUN** | **NOT RUN** |
| Lost or silently altered records/evidence | **PASS** (unchanged; pack still summary) | **NOT RUN** | **NOT RUN** |
| Duplicate issuance / false entitlement | **FAIL** public — issuance does not consume monthly allowance (`P3-2026-10-06`). Serial/`receipt_exists` not reopened | **NOT RUN** | **NOT RUN** |
| Launch / sign-in / save / PDF / GRIN | **PASS** (source contracts re-run) | **NOT RUN** | **NOT RUN** |
| Wrong-project / bucket / source | **PASS** (ops pin `5d5df3d`; project/bucket unchanged in tooling) | **NOT RUN** | **NOT RUN** |
| Sensitive-data leakage | **PASS** (unchanged; not re-logged) | **NOT RUN** | **NOT RUN** |
| Resource crash on supported normal use | **PASS** (Wave 2 not accepted) | **NOT RUN** | **NOT RUN** |
| Public deletion/retention enforcement | **FAIL** — not closed by 180-day request (`P8-2026-10-06`) | **NOT RUN** | **NOT RUN** |

Artwork tracking in `PLAY_SUBMISSION_READINESS.md` is stale (Team 4).
Hashes independently verified **PASS**.

## What was executed (prior session)

| Check | Label | Result |
|---|---|---|
| `git diff --stat 5d5df3d -- functions src eas.json app.json app firebase.json` empty | SOURCE | **PASS** |
| Read production callables, flags, deletion, ops pin, Rules hashes | SOURCE | recorded below |
| `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` | SOURCE (tooling SHA `228a8f5`; not application CI) | **34/34**. Does **not** reopen A/B |
| `npx tsx tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | SOURCE | exit **0**. Missing Admin config → `policy_denied` / `denied` |
| `npx tsx src/goodsEvidence/isolation.contract.test.ts` | SOURCE | exit **0**. Client flags exact `"1"`; purchase-entry `"0"` on `internal-grin` |
| `npx tsx src/goodsEvidence/featureFlag.test.ts` | SOURCE | exit **0** |
| `npx tsx src/services/savedRecords/grinHubEntry.test.ts` | SOURCE | exit **0** |
| `npx tsx src/boot/bootProductionStartup.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx src/billing/quotaUpsell/quotaUpsell.contract.test.ts` | SOURCE | exit **0** |
| `npx tsx tools/goods-evidence-emulator/packaging.unit.test.ts` | SOURCE | exit **0**. Gate exact `"true"` |
| `test:live-rules-grin-merged` / G1/G2 Functions emulator | EMULATOR | **NOT RUN** |
| Live inspect / Functions / Rules / IAM / env / EAS / Play | LIVE_BACKEND | **NOT RUN** |

## Required confirmations (SOURCE)

| Item | Verdict |
|---|---|
| Application tree vs `5d5df3d` empty on named paths | **PASS** |
| Ops-guard tests exist at `228a8f5`; re-run is tooling only | **PASS** (34/34). A/B not reopened |
| Production callables fail closed when Admin config missing | **PASS** — `productionExports.ts` `GrinAdminConfigError` → `{ ok: false, code: "policy_denied", detail: "denied" }`; no `.appspot.com` guess |
| Gate exact `"true"` | **PASS** — `grinFunctionsEnabled`: `GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"` |
| Client flags exact `"1"` | **PASS** — both `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` and `…STORE_RUNTIME_ADMIT` === `"1"` on `internal-grin` only |
| Purchase-entry `"0"` | **PASS** — `internal-grin` / production / preview |

## Release-blocking priorities

Each row is scored per host. **NOT RUN** means this session did not
execute that host. Prior packet notes are not this session’s evidence.

### 1. Cross-account access/writes

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — `5d5df3d` `functions/src/goodsEvidence/productionExports.ts` uses `request.auth?.uid` only. `composed.ts` strips body `uid` / `ownerUid`. G1/G2 paths `users/${uid}/…`; ledger/receipt `ownerUid` must match caller; non-active user `forbidden`. Undeployed merged Rules: GRIN client create/update/delete `false`. |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

### 2. Lost or silently altered records/evidence

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — `g1/serial.ts` `allocateFromCounter` fail-closed (no repair). Existing receipt → `receipt_exists`. Same `commandId` different digest → `digest_conflict`. Replay returns stored success only. G2 stored-byte verify; client hash is a claim (`dcc325a` not reopened). |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

### 3. Duplicate issuance/charges or false entitlement

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — serial inside register transaction; `receipt_exists` blocks a second original. Purchase-entry `"0"`. `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED` exact `"true"` (production-disabled). Client GRIN flags are not admission. |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** (tester admission not seeded this session) |

### 4. Broken launch / sign-in / save / PDF / GRIN flows

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — `5d5df3d` `app/(app)/(tabs)/saved-records.tsx` restores `loadSavedRecordsData` and keeps gated hub tile. Boot contract: splash, `/(auth)/v2`, local-DB failure. `GrinAdmittedSessionHost` `intendedUid` only when admitted; `advanceGrinLiveToken` only; sqlite begin skipped when `liveToken` is null. `policy_denied` → `feature_not_admitted` → unavailable copy. |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

### 5. Wrong-project / bucket / source deployment

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — ops pin `5d5df3d…`; project `vyaamikk-diary` / `982505811909`; bucket `vyaamikk-diary.firebasestorage.app`. `--only` exactly seven `functions:grin*`. Repo `firebase.json` still quota Rules + codebase `default`. Isolated config hash `d224b753…` resolves via firebase-tools 14.20.0 `dirname(--config)` to merged proposed-grin (`551203b8…`), not quota `233b05b7…`. `google-services.json` matches project/bucket. |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** — `GRIN_OPS_ALLOW_LIVE=1` unset; no inspect/apply |

### 6. Sensitive-data leakage

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — G1/G2 allowlisted primitives; off unless `GRIN_G*_LOG === "1"`. Config deny does not echo `FIREBASE_CONFIG` / env. Ops inspect prints gate on/off and key counts, not values or tokens. |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

### 7. Resource behavior that crashes supported normal use

| Host | Verdict |
|---|---|
| SOURCE | **PASS** — boot/session host do not `beginOwnerSession` during render. No new crash reproduction in source. **Wave 2 is not accepted.** |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

NATIVE_DEVICE / PLAY_INSTALLED: **NOT RUN**.

### 8. Missing public deletion/retention enforcement

| Host | Verdict |
|---|---|
| SOURCE | **FAIL** — material finding below |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |

**SHA / path:** `5d5df3d` `functions/src/deletion/firestorePurge.ts`
(`USER_SUBCOLLECTIONS` has no `goodsEvidence*` / GRIN trees);
`functions/src/deletion/userOwnedStoragePaths.ts`
(`letterhead` \| `attachments` \| `pdfs` only — no `grinEvidence`).
`functions/src/deletion/` has no `goodsEvidence` / `grinEvidence`
matches. Packet D pricing / quota / retention **unset**.

**Scenario:** Account deletion completes for a uid that had GRIN
Firestore trees and `users/{uid}/grinEvidence/**` originals. Diary
prefixes purge; GRIN documents and originals do not.

**Practical impact:** Public GRIN would accumulate originals with no
implemented delete-with-account or retain-for-a-stated-window.
Pending-deletion users already fail closed on **new** commands
(`user.status !== "active"`). That is not a retention policy.

**Smallest correction:** Owner writes Packet D delete-or-retain, then a
later authorized Functions change to `completeAccountDeletion` (or an
explicit retain hold). Do not attach GRIN purge silently in this SHA.

**Re-execution waits for that integrated result.**

## Defects found

**None** that reopen ops-guard A/B, `dcc325a`, `4aac867`, or `4409366`.

**2026-10-06 blockers (public GRIN / public submission):**

- **P8-2026-10-06** — Public deletion/retention SOURCE **FAIL**. GRIN paths
  are still absent from the implemented deletion architecture. 15-day
  grace is implemented diary deletion. 180-day requested is **not**
  implemented and **not** Play-certified. Do not mark this FAIL closed
  because the owner wrote 180 days.
- **P3-2026-10-06** — Issuance does not consume monthly record allowance
  (`g1/adapter.ts` register). False entitlement vs approved “one
  issuance = one record” policy. Serial/`receipt_exists` not reopened.

## Assessed backlog (not release-blocking)

- `eas.json` development / `development-production-otp` omit explicit
  purchase-entry `"0"` (still not `"1"`).
- No in-app Internal wipe-warning string (Packet D is operator
  disclosure).
- Storage 1/5/20 GiB **pending economics**; warn95 and GiB refuse-at-cap
  not in source. No silent delete observed. Public upload stays blocked
  until a cap or residual-cost acceptance exists.
- 90-day expiry read + 30-day notice: no production purge job this
  assignment (expected absence).
- `PLAY_SUBMISSION_READINESS.md` artwork “not in this worktree” line is
  stale (Team 4). Hashes independently verified. Onboarding wording and
  live `flock.js` were not independently re-verified this session.

## Remaining approval boundary

HOLD: `GRIN_OPS_ALLOW_LIVE=1`, isolated Rules deploy, tester seeding,
Internal AAB, Play, billing, Wave 2 / G6, `main` merge, NATIVE_DEVICE.
Public GRIN blocked until deletion architecture includes GRIN **and** a
public-approved window exists, **and** issuance consumes monthly
allowance (Team 2 not merged / not reviewed). This review is not human
certification and not a live authorization.

## Bounded verdict

Current as of 2026-10-06 continuation. Prior session table is superseded
for priority 3 and 8.

| Priority | SOURCE | EMULATOR | LIVE_BACKEND |
|---|---|---|---|
| Cross-account access/writes | **PASS** | **NOT RUN** | **NOT RUN** |
| Lost or silently altered records/evidence | **PASS** | **NOT RUN** | **NOT RUN** |
| Duplicate issuance / false entitlement | **FAIL** (issuance allowance) | **NOT RUN** | **NOT RUN** |
| Launch / sign-in / save / PDF / GRIN | **PASS** | **NOT RUN** | **NOT RUN** |
| Wrong-project / bucket / source | **PASS** | **NOT RUN** | **NOT RUN** |
| Sensitive-data leakage | **PASS** | **NOT RUN** | **NOT RUN** |
| Resource crash on supported normal use | **PASS** (Wave 2 not accepted) | **NOT RUN** | **NOT RUN** |
| Public deletion/retention enforcement | **FAIL** | **NOT RUN** | **NOT RUN** |
