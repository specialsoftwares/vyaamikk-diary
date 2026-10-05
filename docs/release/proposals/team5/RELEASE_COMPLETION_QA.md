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

Inspected `/Users/shivamsaurav/vyd-worktrees/grin-combined` on
`integration/grin-g1-g5-source`. Git tree was not edited. Application
paths vs `5d5df3d` were empty on `functions src eas.json app.json app
firebase.json` at inspect time. Origin `main` remains
`0da2f58970f23c7ce6cbefae6efffd49c731f44b`.

## What was executed

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

Public deletion/retention is a **public-release blocker** (priority 8
SOURCE **FAIL**). Documented unset. Not a new silent-alteration bug in
the register/verify path.

## Assessed backlog (not release-blocking)

- `eas.json` development profiles omit explicit purchase-entry `"0"`
  (still not `"1"`).
- No in-app Internal wipe-warning string (Packet D is operator
  disclosure).

## Remaining approval boundary

HOLD: `GRIN_OPS_ALLOW_LIVE=1`, isolated Rules deploy, tester seeding,
Internal AAB, Play, billing, Wave 2 / G6, `main` merge, NATIVE_DEVICE.
Public GRIN blocked until Packet D deletion/retention is chosen and
implemented. This review is not human certification and not a live
backend.

## Bounded verdict

| Priority | SOURCE | EMULATOR | LIVE_BACKEND |
|---|---|---|---|
| Cross-account access/writes | **PASS** | **NOT RUN** | **NOT RUN** |
| Lost or silently altered records/evidence | **PASS** | **NOT RUN** | **NOT RUN** |
| Duplicate issuance / false entitlement | **PASS** | **NOT RUN** | **NOT RUN** |
| Launch / sign-in / save / PDF / GRIN | **PASS** | **NOT RUN** | **NOT RUN** |
| Wrong-project / bucket / source | **PASS** | **NOT RUN** | **NOT RUN** |
| Sensitive-data leakage | **PASS** | **NOT RUN** | **NOT RUN** |
| Resource crash on supported normal use | **PASS** (Wave 2 not accepted) | **NOT RUN** | **NOT RUN** |
| Public deletion/retention enforcement | **FAIL** | **NOT RUN** | **NOT RUN** |
