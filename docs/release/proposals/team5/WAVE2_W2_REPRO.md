# Wave 2 W2-01…W2-05 independent reproductions (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** This document does not mark G6 / device / billing / public-release complete. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

Independence: each finding was **executed** on this branch (merged HEAD containing `6b26903`). Finding-to-test mapping is **not** closure. Existing green tests that do not exercise the defect were re-run only to show they stay green while the defect remains. T5 `c2ef669` CS-02 evidence-port coverage is a same-bytes replay TEST. It is **not** W2-03 identity approval and was not cherry-picked again.

No production fixes were applied in Team 1–4 files. These Team 5 scripts are not independent approval of implementer tests.

## Source SHA

| Tree | Full SHA | Subject |
|---|---|---|
| Combined inspected (PHASE 1 target) | `6b2690315ae746013a02a982f4c76a75d9ac3915` | extract production v10 orchestrator and integrate T5 CS-02 tests |
| Team 5 merged HEAD executed | `c3009860dfe4aa0eb73e642d2794562598064989` | merge combined W2-05 orchestrator and T5 CS-02 tests |
| Production files vs `6b26903` | identical (0 diff) for the W2 paths listed below | — |

`6b26903` is an ancestor of `team/grin-t5-qa`. Combined later gained docs-only `edba5ae` (contract text); PHASE 1 did not merge it and did not wait for T1–T4 W2 landings.

Worktree `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. `node_modules` is a real directory (not a symlink). `/Users/shivamsaurav/Vyaamikk Diary` was not edited.

## Verdict

| ID | Executed result | Labels |
|---|---|---|
| W2-01 | **reproduced** (all four inspected defects) | SQLITE_HOST + mounted-inert |
| W2-02 | **reproduced** (all three inspected defects) | SQLITE_HOST |
| W2-03 | **reproduced** (category default + R1/R2 hash) | INJECTED |
| W2-04 | **reproduced** (isolated rules + emulator) | mounted-inert + STORAGE_EMULATOR |
| W2-05 | **reproduced** (tests still copy `applyInitV10Sequence`) | SQLITE_HOST |

Mapping is not closure. Wave 2 corrections remain in flight. NATIVE_DEVICE / TalkBack / Play / live GST / 2B were not run.

## Commands

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`

Independent executions (this review):

```bash
npx --yes tsx docs/release/proposals/team5/wave2-w2-repro.ts
```

```bash
firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json "npx --yes tsx docs/release/proposals/team5/wave2-w2-04-rules.emulator.ts"
```

Existing tests still green while the defects remain (not closure):

```bash
npx --yes tsx src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts
npx --yes tsx tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts
firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json "npx --yes tsx tools/goods-evidence-storage/rules.emulator.test.ts"
```

`wave2-w2-repro.ts` printed `REPRODUCED=` all eleven sub-findings, `NOT_REPRODUCED=none`, `NATIVE_DEVICE=not_claimed`. W2-04 emulator printed original read denied after `objectKey.state=verified`. Copied v9 tests printed `ok`. Existing `rules.emulator.test.ts` printed `ok` because it reads while the reservation is still `reserved`.

## W2-01 — stale session / custody / uid cache / screens before admission

### ensureSession → `beginOwnerSession` revive — **reproduced** — SQLITE_HOST

`src/services/grin/repository/GrinApplicationRepository.ts:91-95` — if the session is not current, `ensureSession` calls `beginOwnerSession(this.ownerUid)` and stores the new session.

Executed: `endOwnerSession` then `createQueued`. Outbox `persistDraftAndQueue` is session-gated (`outbox.ts:323-324` / `assertSessionOwner` → `session_retired`). `ensureSession` started a new generation and queued `grcp_w201_revive`. Stale callback session stayed non-current. Self-revive around the gate.

### `fallbackListItem` custody `received` — **reproduced** — SQLITE_HOST

`src/services/grin/repository/GrinApplicationRepository.ts:120-126`

Unparseable `payload_json` / `frozen_payload_json` (`{ receiptId }` only) made `parseRegisterBody` return null. `list()` used `fallbackListItem`. Observed `custody=received` and `supplierName=grcp_w201_fallback` (receipt id, not supplier). Hard-coded received; not derived from the unreadable snapshot.

### `appBinding` uid-only cache — **reproduced** — mounted-inert

`src/services/grin/repository/appBinding.ts:15-29`

`Binding` is `{ ownerUid, repo }`. Cache hit is `binding?.ownerUid === uid`. No `dispatchGeneration`. Not SQLITE_HOST: `getLocalDatabase` is expo-sqlite. Combined with the host revive above: same uid keeps a repo that will `beginOwnerSession` again.

### Screens call `getGrinApplicationRepository` before admission — **reproduced** — mounted-inert

| Call | file:line |
|---|---|
| import + `load().list()` | `src/screens/grin/GrinListScreen.tsx:15,71` |
| import + `onSave` `createQueued` | `src/screens/grin/GrinCreateScreen.tsx:12,198` |
| import + `load().get()` | `src/screens/grin/GrinDetailScreen.tsx:8,51` |

`GrinAdmissionGate` only wraps returned JSX (`GrinListScreen.tsx:137`). `useFocusEffect` / `load()` still run. `isGoodsEvidenceEnabled` is not checked at the repository call site. React Native was **not** mounted.

Related remaining (not one of the four inspected bullets; still present on this SHA): `GrinAmendScreen.tsx:18,36`, `GrinQcScreen.tsx:20,33`, `GrinEwbScreen.tsx:21`, `GrinReturnScreen.tsx:18,33`, `GrinPackScreen.tsx:19-20`, plus history/exceptions/attachments still call `getGrinFixtureRepository()`.

`GrinApplicationRepository.test.ts` still asserts list/create/detail **must** contain `getGrinApplicationRepository` and does not retire the session. That green is not closure.

## W2-02 — lease / attachments / reconcile-before-retirement

### `processAttachments` `void workerId` — **reproduced** — SQLITE_HOST

`src/services/grin/outbox/outbox.ts:960-965`

Held original upload, expired TTL, second worker `worker_att_b` took the lease, released upload. Stale worker still wrote `localState=issued` and `originalDurable=true`. `skipStaleCompletion` is not used on this path. `writeCommandAndReceipt` does not require the completing worker to own the live lease.

### `tryAcquireLease` same-worker reclaim — **reproduced** — SQLITE_HOST

`src/services/grin/outbox/outbox.ts:1071-1076` (`OR lease_worker_id = ?`) and `leaseFree` `outbox.ts:1108` (`lease_worker_id === workerId` → free).

Live lease `worker_same` held on `register`. Second `dispatchDue(session, "worker_same")` **hung** (re-entered register) instead of `skipped=lease_held`. Existing ER-1 host test steals with a **different** worker after TTL; that green is not this reclaim.

### Reconcile before retirement on ambiguous failure — **reproduced** — SQLITE_HOST

`src/services/grin/outbox/outbox.ts:699-712` (register). Same order at `746-759` (mutate; not separately driven).

Held `register`, `endOwnerSession`, then `dropNextResponse` `network_ambiguous`. `reconcileCalls` 0→1 **before** `skipStaleCompletion`. Item `skipped=session_retired` (ER-1 persist skip still happens). The defect is the reconcile RPC on a retired session, not issuedNumber minting. Existing lost-response test (`dropNextResponse` without retirement) greening is not this case.

## W2-03 — category default + verified identity

T3 owns `src/services/grin/outbox/ports.ts` (upload input has no category; result has no structured identity). T2 owns `tools/goods-evidence-storage/evidencePort.ts`.

### `resolveCategory` → `invoice` — **reproduced** — INJECTED

`tools/goods-evidence-storage/evidencePort.ts:106-116,176`

Upload with no `originalCategory` dep. Stored evidence object `category=invoice`. Missing/unknown category is coerced, not failed. Contract wave2 text says missing category fails; that text is not this implementation.

### Verified R1 `evidenceId` durable for R2 + different hash — **reproduced** — INJECTED

`tools/goods-evidence-storage/evidencePort.ts:186-187` (`if (existing.state === "verified" || existing.state === "linked") return mapVerified(existing)`)

R1 `ev_w203_id` durable `generation=2` `hashA=9ad4794d…`. R2 same `evidenceId`, different bytes `hashB=888c8edb…`, `originalDurable=true`, same generation, stored claim still `hashA`. No re-check of hash/size/receipt.

`c2ef669` / `tools/grin-acceptance/workflows/cs02-upload-link.injected.test.ts` replays **the same** local bytes. That TEST is not this identity case and is not W2-03 approval.

`GrinEvidenceUploadResult` (`ports.ts:46-51`) is still `{ ok, originalDurable, generation, retryable }` — no `evidenceId` / `receiptId` / `claimedSha256` / `actualSha256` for the outbox to confirm **which** original became durable.

## W2-04 — isolated original read requires reserved/uploading

### Rules text — **reproduced** — mounted-inert

`tools/goods-evidence-storage/storage.rules:44-49` `hasFlightReservation` is `reserved` or `uploading` only.

`tools/goods-evidence-storage/storage.rules:80-83` original `allow read` requires `hasFlightReservation`.

Live `storage.rules` has no `grinEvidence` (unchanged; not deployed).

### Emulator — **reproduced** — STORAGE_EMULATOR

Isolated rules only. Not live IAM.

1. Owner create/read original while `objectKey.state=reserved` succeeded (baseline).
2. Reservation set to `verified` (rules disabled).
3. Owner `getBytes` **denied**.

Existing `tools/goods-evidence-storage/rules.emulator.test.ts` still prints `ok` because it never leaves `reserved`/`uploading` before read. That green is not closure. Verify/link dropping client read remains.

## W2-05 — v9→v10 tests copy `applyInitV10Sequence`

Coordinator extracted production `src/localDb/applyPendingMigrations.ts` (`applyPendingLocalMigrations`, `init.ts:22`). Tests still copy a narrower slice and do **not** import the orchestrator.

| File | Copied function |
|---|---|
| `src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts:41-54` | `applyInitV10Sequence` |
| `tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts:38-51` | `applyInitV10Sequence` |

Comment in the T3 file still says it copies `init.ts` and does not import it. Repair predicate is only `!tableExists(..., "grin_local_receipts")`. Production uses `grinV10TablesPresent` (four tables) and throws `grin_v10_tables_missing` (`applyPendingMigrations.ts:133-139`).

Executed SQLITE_HOST: seed v9, apply the copy, `DROP TABLE grin_outbox_commands`, re-apply the copy → gap remained; `applyPendingLocalMigrations` then repaired all four GRIN tables.

Both copied tests still print `ok`. That green is not closure: they never call production `applyPendingLocalMigrations` / `initializeLocalDatabase`.

## Remaining pending (not claimed)

| Gate | State |
|---|---|
| NATIVE_DEVICE process-death / account-switch | not claimed (`SQLITE_HOST` / INJECTED / STORAGE_EMULATOR only) |
| TalkBack / accessibility device | not run |
| Play installed / internal track | not authorized |
| Live GST / EWB portal | never invented; CS-08 still open at portal |
| Live 2B / GST portal | never invented; CS-09 still open at portal |
| Functions `goodsEvidence` / `handleGrin*` export | still absent from `functions/src/index.ts` |
| Live Storage/Firestore Rules grin paths | live `storage.rules` has no `grinEvidence` |
| `app.json` `android.versionCode` | `23` (not bumped) |
| Purchase-entry / goods-evidence flags | `eas.json` purchase-entry `"0"`; goods-evidence flag not enabled |
| G6 / billing / public release | not complete; not reviewed as closed |

PHASE 2 (T1–T4 landing review) is not this document. Coordinator will resume Team 5 after those landings. This PHASE 1 did not wait or poll.
