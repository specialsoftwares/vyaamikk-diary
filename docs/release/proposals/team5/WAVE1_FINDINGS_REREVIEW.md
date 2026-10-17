# Wave 1 findings re-review (Team 5)

Independent QA of the T1/T2/T3 fixes that landed on combined after Wave 1 review `070a388`. AI review role, not human certification.

**G6 is not complete.** This document does not mark any acceptance-matrix row `complete`. It does not authorize merge to main, deploy, EAS, Play, live Rules/Storage/IAM, `versionCode` bump, or purchase-entry flag changes.

Independence: **read `git show` / merge diffs of the listed SHAs, executed the tests below on combined HEAD, did not approve from coordinator ACK files.** `TEAM1_M1_ACK.md`, `TEAM2_M2_ACK.md`, and `TEAM3_M3_ACK.md` were treated as claims to re-check, not as evidence. Implementations were not silently patched.

## Verdict

| Item | Status |
|---|---|
| M1 (mutation missing receipt → `not_found`) | **closed** |
| M2 (identity/admission before envelope validation) | **closed** (G1 and G2) |
| M3 (skip undispatchable outbox types before lease) | **closed** |
| L4 (`GrinReconcileResult`; no fabricated issued GRIN) | **closed** |
| New Medium/High defects | **none confirmed** |
| Implementations of the T1/T2/T3 fixes | **approved** |
| G6 | **incomplete** |
| Production admission / Functions export / flag enable / merge to main | **not approved** |

Wave 1 source remains undeployed, default-off. Closing M1–M3 and L4 does not complete G6 and does not authorize a production callable or non-fixture UI.

## Exact SHAs

Source tree executed and read: `/Users/shivamsaurav/vyd-worktrees/grin-combined` on `integration/grin-g1-g5-source`.

| Role | Full SHA | Subject |
|---|---|---|
| Prior Team 5 Wave 1 review | `070a388440033c43d437579b1bc3dcbb2bc84800` | approved source with findings M1–M3 and L4 |
| T1 source | `00273f144dc38b6ae5e82696ab21b6eca1e45827` | identity gate before validation; mutation missing receipt `not_found` |
| T1 merge | `308802637094a33a45f4a7a8e1c220fd8da0fe42` | merge Team 1 identity gate and mutation not_found |
| T2 source | `8395ade2e84fee60742151cd6c35f920d322e62e` | G2 authorize before `parseReserve` / lifecycle parse |
| T2 merge | `3653cf79531611208f18d924426f61ff597dc7db` | merge Team 2 authorize-before-parse (`package.json` kept from combined; adapter + tests from T2) |
| T3 source | `7ff2f36b60ccb833739be1ec1ba0554c1c2b5123` | unleased skip for undispatchable outbox rows; `GrinReconcileResult` |
| T3 merge | `4cd2647632cdcc15dbe19c1814ec81f6980cc49c` | merge Team 3 unleased skip |
| Combined HEAD (this re-review) | `9cd092825d7af25cd09960871140b8dea289630a` | record Team 1 M1/M2 merge and queue Team 5 re-review |

All seven fix/merge SHAs and `070a388` are ancestors of combined HEAD. Diffs reviewed as `git show` of the source commits (not the coordinator notes). This file is committed on `team/grin-t5-qa` only. Historical dirty workspace `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `node_modules` was not shared by symlink; tests ran against the real `node_modules` directory already present on `grin-combined`.

## Guardrails (re-checked on combined HEAD `9cd0928`)

| Check | Result |
|---|---|
| `src/goodsEvidence/ports.ts` `GRIN_CONTRACT_REVISION` | `2026-10-01.wave1b` |
| `functions/src/index.ts` exports `goodsEvidence` / `handleGrin*` | **no** |
| `functions/src/goodsEvidence/callables.ts` | still fail-closed `policy_denied` even when `GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"` (no live adapter) |
| Live `storage.rules` contains `grinEvidence` | **no** (emulator-only rules under `tools/goods-evidence-storage/` still have it) |
| Live `firestore.rules` contains `goodsEvidence` | **no** |
| `app.json` `android.versionCode` | `23` |
| `eas.json` preview/production `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` (quota upsell also `"0"`) |
| `eas.json` `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | absent (not enabled) |
| `isGoodsEvidenceBlockedByStoreRuntime` / store-or-standalone forces off | intact in `src/goodsEvidence/featureFlag.ts` (no test override) |
| `docs/release/GRIN_ACCEPTANCE_MATRIX.md` row status `complete` | not set by this review; G6 rows remain scaffold / unapproved |

## Finding-by-finding

### M1 — authorized missing receipt on mutation returns `not_found` — **closed**

Prior observation (`070a388`): `mutate` used `deny("invalid", "unknown receipt")` after a successful gate.

T1 change (read in `00273f1` / current `tools/goods-evidence-emulator/adapter.ts`): after gate + `prepareMutation`, missing `receiptSnap` and failed `hydrateReceipt` return `deny("not_found", "receipt not found")`. A hydrated receipt whose `original.ownerUid` / `original.ledgerId` does not match the caller still returns generic `forbidden`. Adapter still assigns `persisted.original = cloneSnapshot(receipt.original)` before `tx.set` (issued original not rewritten). `applyAmendFields` writes `next.effective` only.

Evidence executed:

- **INJECTED_PORT** `mutations.injected.unit.test.ts` — missing / unreadable → `not_found`; foreign original → `forbidden` / `denied`
- **FIRESTORE_EMULATOR** `mutations.emulator.test.ts` — same matrix on port **8088**

### M2 — identity/admission before envelope validation — **closed**

Prior observation: G1 `prevalidate*` / digest compare ran before `gate()`; G2 `parseReserve` ran before `authorize()`. Malformed envelopes and digest mismatches could return `invalid` / `digest_conflict` to `pending_deletion` / inactive callers.

T1 (`00273f1`): `register` / `reconcile` / `mutate` read admission scope and `gate()` inside the transaction **before** `prepareRegister` / `prepareReconcile` / `prepareMutation`. `peekLedgerId` loads a ledger only when the id is a safe document id; user/`pending_deletion`/inactive still runs even when the ledger is not peeked. Replay of a stored command remains **after** gate (`mutations.injected.unit.test.ts` “pending_deletion has no replay exception”: committed QC then `pending_deletion` replay is `forbidden`, not success).

T2 (`8395ade`): `authorizeInput()` (user exists/active → ledger owner+active when peeked → admission `newCommands`) runs before `parseReserve`, `parseLifecycle`, `link`, and `createUploadUrl`. Malformed ids are omitted from the authz path so a parse failure is not returned as the authorization result. `reserve` still re-authorizes inside the write transaction after parse.

Evidence executed:

- **INJECTED_PORT** G1 register: pending_deletion / inactive + malformed envelope or wrong digest → `forbidden` / `denied`
- **INJECTED_PORT** G1 mutations: same
- **FIRESTORE_EMULATOR** G1 mutations: pending_deletion + malformed / digest mismatch → `forbidden`
- **INJECTED_PORT** G2: `pending_deletion garbage body is forbidden not invalid` for reserve / completeUpload / verify / link; unauthenticated garbage stays `unauthenticated`; active caller + garbage stays `invalid`

G2’s new pending_deletion+garbage cases are **INJECTED_PORT** only (not added to `storage.emulator.test.ts`). Same adapter class; not treated as an open M2.

### M3 — skip undispatchable outbox types before lease — **closed**

Prior observation: `dispatchDue` acquired a lease, then `dispatchLeased` returned `skipped: "unsupported_type"` and left the row in `dispatching`.

T3 (`7ff2f36`): before `tryAcquireLease`, if the row is not `attachment_pending` and `canDispatchCommandType` is false, the worker does **not** take a lease. A leftover `dispatching` unsupported row is released to `queued` with the lease cleared. `canDispatchCommandType` is true for `registerGoodsReceipt`, or for mutation types only when `server.mutate` is a function. Belt-and-suspenders skip inside `dispatchLeased` also releases to `queued`.

Evidence executed (**SQLITE_HOST**, printed `NATIVE_DEVICE=not_claimed`; **not NATIVE_DEVICE**):

- `amendFields` with default fake server (no `mutate`): `skipped: "unsupported_type"`, `localState` remains `queued`, `leaseWorkerId` / `leaseUntilMs` null, `issuedNumber` null
- with `{ mutate: true }`: mutation dispatches to `issued` with `issuedNumber` still **null** and `serialsIssued === 0` (no minted GRIN)

### L4 — outbox reconcile port is register-shaped — **closed**

`GrinServerCommandPort.reconcile` is now `Promise<GrinReconcileResult>`. Register dispatch maps via `registerResultFromReconcile`: a mutation-shaped success becomes `integrity` / `reconcile_result_not_register` rather than inventing `issuedNumber`. Mutation dispatch maps the other way and copies `issued_number` from the existing receipt row only. Isolation contract still forbids `formatGrinNumber` in the outbox module. Combined G2/G1 typechecks passed.

## Regression hunts

| Hunt | Result |
|---|---|
| `pending_deletion` still `forbidden` with **no** replay exception | Holds. Gate/authorize runs before command lookup and before body validation. Injected mutation test: stored success + later `pending_deletion` replay is `forbidden`. |
| Foreign missing still `forbidden` | Holds. Caller-uid-scoped paths; missing/foreign ledger is `forbidden`. G2 mallory + Alice ledgerId is `forbidden`; mallory + own ledger + unknown evidenceId is `not_found`. Hydrated foreign `original` on a mutation is `forbidden`, not `not_found`. |
| Issued `original` not overwritten | Holds. Mutations clone `effective` / view / ledgers; adapter restores `persisted.original` from the pre-mutation receipt. |
| No fabricated issued GRIN | Holds. Outbox still does not call `formatGrinNumber`. Skip path and mutation success keep `issuedNumber` null unless a prior register stored one on the receipt. Fake mutate port does not increment serials. |
| Functions still unexported | Holds. `functions/src/index.ts` has no `goodsEvidence` / `handleGrin*` export. Callables remain fail-closed. |
| Live `storage.rules` still no `grinEvidence` | Holds. |
| `versionCode` 23 | Holds. |
| Purchase-entry flags `"0"` | Holds (preview + production; quota upsell `"0"`). |
| Store-runtime block intact | Holds. `isGoodsEvidenceEnabled()` returns false when `env.runtimeKind === "store-or-standalone"`. |

## Commands run (executed on combined HEAD `9cd0928`)

Ports **8088 / 8090 / 8091 / 9200** were free. G1 then G2 emulators were run **sequentially**. No competing emulator was started. JAVA warning from firebase-tools was ignored; suites still exited 0.

| Command | Exit | Evidence labels |
|---|---|---|
| `npm run typecheck:goods-evidence-g1` | 0 | compile-only |
| `npm run typecheck:goods-evidence-g2` | 0 | compile-only |
| `npm run test:goods-evidence-g1-unit` | 0 | **INJECTED_PORT** (injected + mutations.injected) plus hash/limits/serial/retry/isolation/packaging |
| `npm run test:goods-evidence-g2-unit` | 0 | **PURE_DOMAIN** + **INJECTED_PORT** (includes pending_deletion garbage) + isolation |
| `npm run test:grin-outbox` | 0 | **SQLITE_HOST**. Printed `NATIVE_DEVICE=not_claimed`. **Not NATIVE_DEVICE.** |
| `npm run test:goods-evidence-g1-emulator` | 0 | **FIRESTORE_EMULATOR** port **8088**, project `demo-vyaamikk-grin-g1` (register, rules, parity, corrections, mutations including M1/M2 cases) |
| `npm run test:goods-evidence-g2-emulator` | 0 | **FIRESTORE_EMULATOR** port **8091** + **STORAGE_EMULATOR** port **9200**, project `demo-vyaamikk-grin-g2` |

**Not run (and not claimed):** `NATIVE_DEVICE`, `PLAY_INSTALLED`, `MOUNTED_REACT_INERT_NATIVE`, `test:all`, full `ci:verify`, live Admin SDK, Play-installed binary, TalkBack.

`PERMISSION_DENIED` lines in emulator logs are from rules tests (`assertFails`); they are not suite failures.

## Non-blocking residuals (not reopeners)

These are not M1–M3/L4 regressions and are not treated as new Wave 1 source blockers.

1. G2 pending_deletion + garbage body is covered on **INJECTED_PORT** only, not on **STORAGE_EMULATOR**. Same `GoodsEvidenceStorageAdapter`.
2. G1 register pending_deletion + malformed envelope is covered on **INJECTED_PORT**; the **FIRESTORE_EMULATOR** additions in this round are on the mutation suite. Register emulator still covers pending_deletion with a well-formed envelope.
3. When `server.mutate` exists, a successful mutation is stored as outbox `localState: "issued"` with `issuedNumber` still null. That reuses the register success state name; it does **not** mint a GRIN number. Wave 1 product screens still do not use this outbox (fixtures).
4. G2 `authorizeInput` is a separate read transaction before parse; the write path authorizes again. Fail-closed; extra round-trip only.
5. Retention/deletion of GRIN after `pending_deletion` / `retireIdentity` remains an unresolved policy (deletion jobs were not altered).

## What this re-review could not prove

- **NATIVE_DEVICE** process death, expo-sqlite on device, TalkBack, or account-switch
- **PLAY_INSTALLED** store binary or production runtime with the store-or-standalone block
- Combined CS-01…CS-11 as an end-to-end device workflow
- Production Cloud Functions invocation, App Check, or live IAM
- That emulator Rules equal future production Rules (proposals only; live files unchanged)

## Explicit non-actions

- Did not merge to main or open a merge-to-main PR
- Did not deploy, build, enable flags, edit live Rules/Storage/IAM, bump `versionCode`, or change purchase-entry flags
- Did not mark G6 or any matrix ID complete
- Did not update Jira
- Did not edit Team 1–4 implementation files or `/Users/shivamsaurav/Vyaamikk Diary`

## Approval statement (copyable)

T1/T2/T3 findings fixes on combined HEAD `9cd092825d7af25cd09960871140b8dea289630a` (T1 `00273f1`/`3088026`, T2 `8395ade`/`3653cf7`, T3 `7ff2f36`/`4cd2647`) are **approved**. Wave 1 findings M1, M2, M3, and L4 are **closed**. No new Medium/High defects were confirmed on the executed evidence. G6 remains **incomplete**. This is **not** approval for production admission, Functions export, flag enablement, live Rules, `versionCode` bump, or merge to main.
