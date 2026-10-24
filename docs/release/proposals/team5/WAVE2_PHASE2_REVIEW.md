# Wave 2 PHASE 2 independent review (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** This document does not mark G6 / device / billing / public-release complete. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

PHASE 1 `bff108c` reproduced the inspected defects at `6b26903`. That mapping is **not** closure. This review re-executed the same cases on the merged tree and did not approve from the coordinator narrative. T5 `c2ef669` CS-02 same-bytes replay remains a TEST, not W2-03 identity approval.

No Team 1–4 production files were edited. Team 5 changed only `tools/grin-acceptance/**`, `docs/release/proposals/team5/**`, and a pointer line in `GRIN_ACCEPTANCE_MATRIX.md`.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| PHASE 1 notes | `bff108c3d20a6806fad70e99b7c0bfe01d3e038c` | W2-01…W2-05 reproductions (not closure) |
| Combined / this review | `e94b78cdc07458c457ba7ef5bb6308109d7ec2cd` | keep register snapshots; map T4 type |
| T1 W2-06 | `cbcb1b9` | composed authenticated G1 + JS httpsCallable transport |
| T2 W2-03/W2-04 | `06d897a` | evidence identity + isolated retained Storage reads |
| T3 W2-02/W2-05 | `9a0de6d` | lease_attempt_id fence; category persist; production migrator tests |
| T4 W2-01 | `decac00` | no beginOwnerSession revive; remaining screens off fixture; admission host |
| Coordinator glue | `e94b78c` | persistMutationAndQueue does not overwrite register `payload_json` |

`team/grin-t5-qa` fast-forwarded to `e94b78c`. Worktree `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. `node_modules` is a real directory. `/Users/shivamsaurav/Vyaamikk Diary` was not edited.

## Verdict

Inspected W2-01…W2-05 defects **no longer reproduce** on `e94b78c` (independent host / injected / emulator re-runs). Labelled CS/ER-4/mount/interop workflows were executed (not `runIds.ts` stubs).

**Wave 2 is still not accepted.** App binding remains FAKE-uninjected; Functions still do not export GRIN; live Rules unchanged; NATIVE_DEVICE / TalkBack / Play / live GST / 2B / billing flags remain open.

| ID | PHASE 1 at `6b26903` | PHASE 2 at `e94b78c` |
|---|---|---|
| W2-01 | reproduced | **reproduced-then-fixed** |
| W2-02 | reproduced | **reproduced-then-fixed** |
| W2-03 | reproduced | **reproduced-then-fixed** |
| W2-04 | reproduced | **reproduced-then-fixed** |
| W2-05 | reproduced | **reproduced-then-fixed** |

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` unless noted.

```bash
npx --yes tsx tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts
# SQLITE_HOST; NATIVE_DEVICE=not_claimed; ok (production initializeLocalDatabase / applyPendingLocalMigrations)

npx --yes tsx docs/release/proposals/team5/wave2-phase2-repro.ts
# REPRODUCED_THEN_FIXED=all eleven sub-findings; STILL_OPEN=none

npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts          # ok
npx --yes tsx src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts        # ok
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts  # ok
npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts            # ok; mounted-inert host
npx --yes tsx tools/grin-interop/cs01-offline-restart-register.sqliteHost.test.ts
# SQLITE_HOST + INJECTED_PORT team1:serverPort.ts; issued GRIN/MAIN/FY2026-27/000001

npx --yes tsx tools/grin-acceptance/runWorkflows.ts
# ER-4 + CS-01…CS-11 + mutation-keeps-register; CS-04 FIRESTORE_EMULATOR not run (host unset)
# CS-02 STORAGE_EMULATOR not run (hosts unset)

firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 \
  --config tools/goods-evidence-storage/firebase.json \
  "npx --yes tsx docs/release/proposals/team5/wave2-w2-04-rules.emulator.ts"
# retained verified read succeeded; newCommands=deny still reads retained; in-flight reserved+deny failed

firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 \
  --config tools/goods-evidence-storage/firebase.json \
  "npx --yes tsx tools/goods-evidence-storage/rules.emulator.test.ts"
# ok (clean emulator; do not chain after the T5 script in one process)

npx --yes tsx src/services/grin/transport/firebaseTransport.unit.test.ts  # ok INJECTED / not live deploy
npx --yes tsx src/services/grin/transport/isolation.contract.test.ts      # ok
```

T1 composed injected unit test was executed on `/Users/shivamsaurav/vyd-worktrees/grin-combined` (same SHA; t5-qa `functions/` lacks `firebase-admin`):

```bash
npx --yes tsx tools/goods-evidence-emulator/composed.injected.unit.test.ts
# ok (INJECTED / not live deploy)
```

`scenarios/cs01-*.test.ts` remain stubs (`assertWorkflowNotExecuted`). They were not treated as e2e passes.

## W2 findings (re-executed)

### W2-01 — **reproduced-then-fixed**

| Sub-finding | Evidence |
|---|---|
| `ensureSession` revive | `GrinApplicationRepository.ts:386-395` `assertLive` throws `session_retired`. No `beginOwnerSession(this.ownerUid)`. Retired `createQueued` threw; no row queued. SQLITE_HOST. |
| fallback custody `received` | `snapshot.ts:76-90` `incompleteListItem` `custody: null`, `projection: unknown_incomplete`. SQLITE_HOST. |
| uid-only cache | `appBinding.ts:25-125` keyed by uid+`dispatchGeneration`. Wrong generation → `grin_binding_retired`. Only `startGrinOwnerSession` begins. SQLITE_HOST via `setGrinApplicationDbFactoryForTests`. |
| screens before admission | `GrinAdmittedSessionHost.tsx:21-46` decides admission before children. All remaining GRIN screens use `requireLiveGrinApplicationRepository`. No `getGrinFixtureRepository` in `src/screens/grin/*`. mounted-inert source + `grinScreens.react.mount.test.ts` (inert children, not native screens). |

### W2-02 — **reproduced-then-fixed**

| Sub-finding | Evidence |
|---|---|
| same-worker reclaim | `outbox.ts:1251-1308` no `OR lease_worker_id = ?`. Second `dispatchDue(same worker)` `skipped=lease_held`. |
| reconcile before retirement | `outbox.ts:845-876` `skipStaleCompletion` before reconcile. `reconcileCalls` 0→0; `skipped=session_retired`. |
| `processAttachments` void workerId | `outbox.ts:1140-1184` uses attempt fence + `skipStaleCompletion`. Stale worker `skipped=lease_held`, `localState=attachment_pending`. |

### W2-03 — **reproduced-then-fixed**

T3 `ports.ts` now requires `category` / structured identity. T2 `evidencePort.ts:204-219` returns `null` when missing/invalid (no invoice default). `replayIdentityError` (`:314-353`) rejects R2 different hash.

Independent INJECTED: missing category `ok=false`, no stored object. R1 durable; R2 different hash `originalDurable=false`. `c2ef669` same-bytes replay was not used as this proof.

### W2-04 — **reproduced-then-fixed**

`tools/goods-evidence-storage/storage.rules:118-125` `canReadOriginal` allows retained `uploaded_unverified` / `verified` / `linked` even when `newCommands=deny`. Flight reads still need admission. Live `storage.rules` has no `grinEvidence`.

Independent STORAGE_EMULATOR: verified read succeeded; deny still read retained; reserved+deny denied.

### W2-05 — **reproduced-then-fixed**

T3 `migrateGrin.v9Startup.sqliteHost.test.ts` and T5 `v9-v10-grin-off.sqliteHost.test.ts` now call `applyPendingLocalMigrations` / `initializeLocalDatabase`. Copied `applyInitV10Sequence` is gone. SQLITE_HOST: dropped `grin_outbox_commands` repaired by the production orchestrator. Flag off throughout ER-4.

### Coordinator `e94b78c` glue

`persistMutationAndQueue` (`outbox.ts:471-484`) updates receipt command/digest/state and does **not** write `payload_json`. Independent SQLITE_HOST `w2-mutation-keeps-register.sqliteHost.test.ts`: register snapshot unchanged after `amendFields`; mutation frozen payload holds `Bay Q`. T4 maps `type` + `commandType` into that API. G1 `tools/goods-evidence-emulator/tsconfig.json` maps `@/goodsEvidence/evidence`.

## Workflows executed (labelled; not stubs-as-e2e)

| Workflow | Labels | Result / still open |
|---|---|---|
| Offline queue restart register (CS-01 interop) | SQLITE_HOST + INJECTED_PORT (`team1:serverPort.ts`) | executed; NATIVE_DEVICE process-death not claimed |
| Categorized upload / hash / link / identity (CS-02 + PHASE 2 INJECTED) | INJECTED_PORT | executed; STORAGE_EMULATOR only if hosts set |
| Account change / generation retirement (CS-03 + binding) | SQLITE_HOST | executed; NATIVE_DEVICE account-switch not claimed |
| Concurrent serials / conflict (CS-04, CS-05) | INJECTED_PORT | executed; CS-04 FIRESTORE_EMULATOR not run here |
| Amend / QC / partial return (CS-05, CS-06 + repository host) | INJECTED_PORT / SQLITE_HOST | executed |
| EWB observation without invented portal (CS-08) | PURE_DOMAIN | executed; live GST/EWB portal never called |
| Pack missing original (CS-07 + repo `exportPack`) | PURE_DOMAIN + INJECTED_PORT | executed; completeness incomplete / ITC `not_determined` |
| Startup migration GRIN off (ER-4) | SQLITE_HOST | executed via production orchestrator |
| Mounted admission / session / disabled-feature | SQLITE_HOST + mounted-inert React | `grinScreens.react.mount.test.ts` ok; not TalkBack / native screens |

## Fake / fixture paths and reachability

| Path | Reachable from GRIN screens? |
|---|---|
| `createUninjectedGrinServerPort` (`portKind: FAKE`, `policy_denied` / `g1_server_not_injected`) | **Yes** — `appBinding.ts:71` is what `startGrinOwnerSession` injects. App queue cannot register/reconcile/mutate for real. |
| `createFirebaseGrinTransport` | **Not wired** into app binding. Unit-tested INJECTED transport only. |
| T1 `functions/src/goodsEvidence/composed.ts` | **Not exported** from `functions/src/index.ts`. INJECTED/emulator composition only. |
| `GrinFixtureRepository` | **Not reachable** from `src/screens/grin/*`. Still imported by PDF unit tests (`grinPdfAdapter.test.ts`). Labelled FAKE. |
| `createFakeGrinServerPort` / `createFakeEvidenceUploadPort` | Test-only. |

## Client / server composition boundary

```
App screens
  → GrinAdmittedSessionHost (flag + store-runtime)
  → startGrinOwnerSession
  → GrinOutbox + createUninjectedGrinServerPort (FAKE)
  → persistDraftAndQueue / persistMutationAndQueue locally only

T1 composed callables (UNDEPLOYED_COMPOSED)
  → request.auth.uid only
  → GoodsEvidenceRegisterAdapter when GRIN_GOODS_EVIDENCE_FUNCTIONS=true
  → not in functions/src/index.ts

JS httpsCallable transport (INJECTED, not live deploy)
  → names in callableNames.ts
  → not bound by appBinding
```

INJECTED tools adapters (G1 emulator / G2 evidence port) are host tests. They are not the production app path.

## Remaining gates (not claimed)

| Gate | State |
|---|---|
| Functions GRIN export | absent from `functions/src/index.ts` |
| Live Storage/Firestore grin paths | live `storage.rules` has no `grinEvidence` |
| App G1 injection | FAKE uninjected port |
| `android.versionCode` | `23` |
| Purchase-entry / goods-evidence flags | purchase-entry `"0"`; goods-evidence not `"1"` |
| NATIVE_DEVICE process-death / account-switch | not claimed |
| TalkBack | not run |
| Play installed | not authorized |
| Live GST / EWB / 2B portals | never invented |
| G6 / billing / public release | not complete |

PHASE 2 did not merge to main, deploy, enable flags, bump `versionCode`, or edit live Rules.
