# Team 2 — Policy implementation handoff (coordinator merge)

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence`  
Branch: `team/grin-t2-evidence`  
**Starting SHA:** `aa5253e4e070195227055cde836d6b528d5e0070`  
**Final SHA:** `14e56f3802e29825708db591a5feb5bf8b000178` (team branch). Combined fold is a later coordinator SHA.

Evidence labels used below: **SOURCE** (repo code), **INJECTED** (in-memory stores), **EMULATOR** (not run this slice).

## Coordinator merge in one screen

Safe to merge Team 2 source **without** flipping live flags. Quota and storage enforcement ride existing `grinRegisterGoodsReceipt` / `grinReserveEvidence` once Functions with this source are built; they stay **off** when `quotaEnforcementEnabled` is missing/false (same as Option-C).

**Do not** advertise GiB caps. **Do not** flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`. **Do not** wire a purge scheduler. **Do not** change `DELETION_GRACE_MS`. **Do not** edit `functions/src/index.ts` for this merge.

## Behavior (SOURCE)

### A. Commercial

GRIN is included in existing Starter / Professional / Business. No GRIN SKU. Catalog paise in `functions/src/billing/products.ts` are **SOURCE expected**, not Play authority, not run on Play: starter 99/249/799 INR; professional 249/649/1999; business 499/1299/3999 (paise 9900 etc). `GRIN_INCLUDED_IN_EXISTING_PLANS = true`.

### B. Issuance quota

First `registerGoodsReceipt` consumes **one** ordinary monthly slot (free 25, starter 100, professional/business −1) in the **same Admin transaction** as serial/receipt/event/command. Replay of the same `commandId` does not increment. Mutations, QC, return, link, reconcile do not consume.

`lastRecordCollection` label: `goodsEvidenceReceipts` (parallel value, **not** a client top-level collection). `readUsageSnapshot` still accepts any non-empty collection string (historical `letterheadDocs` readable). Malformed usage → `quota_state_invalid` (no first-create). Status missing or `quotaEnforcementEnabled !== true` → enforcement off. Failed status **read** throws (issuance not claimed). Denies: `quota_exhausted` / `quota_state_invalid` / expired `policy_denied`. Letterhead remains `quotaConsumption: "none"`. Ordinary diary/PO/credit/pack unchanged.

### C. Storage accounting

Proposed caps **PROPOSED_PENDING_OWNER_CONFIRMATION**: Starter 1 GiB, Professional 5 GiB, Business 20 GiB, free 0 when enforcement on. Total retained per account (originals **and** derivatives). Warn 80%/95% (structured `storageWarning`; do not fail). At cap: `quota_exhausted`, never claim upload succeeded, never silent-delete, no overage fee. View/download/export remain. 15 MiB PDF / 10 MiB image / two concurrent uploads unchanged. Concurrent reservations, retry, abandoned-release, repair (no delete), downgrade-over-limit (`storageOverLimitRetained`) implemented. Replay of an in-flight reservation is not a new upload (expiry does not block retry).

**Economics verdict:** typical usage supports the proposal; heavy 20 GiB + repeated downloads can exceed business monthly ₹499 after assumed 15% Play cut. **Do not advertise.** Alternative for owner: **256 MiB / 1 GiB / 5 GiB**. See `STORAGE_ECONOMICS.md`.

### D–E. Active accounts / expiry

No age-based purge of issued evidence on entitled/free accounts. After **genuine** expiry: stop new issuance/uploads; 90 days read/download/export; 30-day final notice; then SOURCE `expired_purge_eligible` only. Clock injected. **No Cloud Scheduler.** Missing status / `neverSubscribed` is free, not expiry.

### F. Explicit account deletion

Three facts, not collapsed:

1. Implemented: `DELETION_GRACE_MS = 15 days` (unchanged).
2. Owner-requested 180-day policy: **not** legally/Play approved.
3. Public-operation policy: **UNRESOLVED**.

Reusable lists: Storage `users/{uid}/grinEvidence/`, Firestore trees under `goodsEvidenceLedgers` (+ admission/uploadControl/object keys/storage accounting). `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`. `USER_STORAGE_CATEGORIES` **not** extended (would purge live GRIN). `scheduledDeletionCleanup` behavior unchanged while the flag is false. `force: true` exists for unit tests only.

### G. Exit / export

Pack PDF remains `originalsBundled=false` / not a complete archive. Working path: `downloadGrinOriginal` + `assembleReceiptAuditExport` + optional STORE ZIP; G2 `downloadOriginal` for retained cloud bytes (INJECTED). Missing/corrupt/too_large/session_retired/derivative_not_original; bounds 64 MiB / 48 files.

### H. Testers

Synthetic evidence ids only. No invented UIDs.

Encrypted PDF backup = backlog. No zero-knowledge / GST / 2B/EWB claims.

## Files (authoritative → packaged)

Edit **tools** G1/G2 + `src/goodsEvidence`, then `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts`. Do not hand-edit generated `functions/src/goodsEvidence/g1|g2|entitlementLifecycle.ts`.

| Area | Files |
|---|---|
| Economics / policy docs | `docs/release/proposals/team2/STORAGE_ECONOMICS.md`, `DELETION_WINDOW_180_ASSESSMENT.md`, `firestore.rules.grin-quota.md`, `scripts.md`, this handoff |
| Catalog | `functions/src/billing/products.ts` (+ unit test), `functions/src/billing/types.ts` |
| Option-C union | `src/billing/optionC/usageTransition.ts` (+ test) |
| Domain expiry | `src/goodsEvidence/entitlementLifecycle.ts` (+ test, index export) |
| Deny codes | `src/goodsEvidence/ports.ts` (`quota_exhausted`, `quota_state_invalid`) |
| G1 | `tools/goods-evidence-emulator/{adapter,quota,paths,types,injectedStore}.ts` |
| G2 | `tools/goods-evidence-storage/{adapter,storageQuota,paths,types,FAKE_injectedFirestore}.ts` |
| Composed warnings/denies | `functions/src/goodsEvidence/composed.ts` (KEEP; not generated) |
| Deletion | `functions/src/deletion/{grinCleanupLists,grinCleanup,finalPurge,userOwnedStoragePaths}.ts` |
| Export | `src/services/grin/export/*`, `GrinApplicationRepository.exportReceiptAudit` |
| Outbox | `src/services/grin/outbox/{classify,types}.ts` (`monthly_quota_exhausted` permanent) |
| Transport | `src/services/grin/transport/parseRemote.ts` |

**Not edited (coordinator-owned):** `package.json`, lockfiles, workflows, `app.json`, `eas.json`, `firebase.json`, `functions/src/index.ts`, repo-root `firestore.rules`.

## `functions/src/index.ts` — proposed diff

**No change required** for this merge. Issuance quota and storage admission run inside existing:

- `grinRegisterGoodsReceipt`
- `grinReserveEvidence` (warnings + cap)

Optional later (not applied): `grinDownloadOriginal` / `grinStorageStatus` would need composed methods + `productionExports` names + index re-exports. Repair/abandoned-release stay Admin/test surfaces.

```diff
# NOT APPLIED — existing seven GRIN re-exports are sufficient
# export { grinRegisterGoodsReceipt, grinReconcileCommand, grinMutateGoodsReceipt,
#          grinReadGoodsReceipt, grinReserveEvidence, grinBeginEvidenceUpload,
#          grinUploadEvidence } from "./goodsEvidence/productionExports";
```

## firestore.rules — proposed patch (not applied)

Comment-only. **Do not** add `goodsEvidenceReceipts` to `quotaLinkedCollection` (wrong path; Admin bypasses Rules). See `docs/release/proposals/team2/firestore.rules.grin-quota.md`.

## Tests (commands and exit codes)

All **INJECTED** / **SOURCE** unless noted. **EMULATOR** G1/G2 not run this slice.

| Command | Exit | Label |
|---|---|---|
| `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` | 0 | SOURCE packaging |
| `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | 0 | INJECTED |
| `npx tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | 0 | INJECTED |
| `npx tsx functions/src/deletion/grinCleanup.unit.test.ts` | 0 | INJECTED |
| `npx tsx src/goodsEvidence/entitlementLifecycle.test.ts` | 0 | SOURCE / INJECTED clock |
| `npx tsx src/services/grin/export/receiptAuditExport.test.ts` | 0 | INJECTED |
| `npx tsx src/billing/optionC/usageTransition.test.ts` | 0 | SOURCE |
| `npx tsx functions/src/billing/products.unit.test.ts` | 0 | SOURCE |
| `npm run typecheck:goods-evidence-g1` | 0 | SOURCE |
| `npm run typecheck:goods-evidence-g2` | 0 | SOURCE |
| `npm run test:goods-evidence-g1-unit` | 0 | INJECTED |
| `npm run test:goods-evidence-g2-unit` | 0 | INJECTED |
| `npm run test:goods-evidence` | 0 | SOURCE / INJECTED |
| `npm run test:account-deletion-unit` | 0 | INJECTED |
| `npm --prefix functions run build` | 0 | SOURCE |
| `npx tsx src/services/grin/repository/GrinApplicationRepository.test.ts` | 0 | SQLITE_HOST |
| `npm run typecheck` | 2 | pre-existing `expo-document-picker` missing types in `grinOriginalPicker.ts` only; Team 2 files clean |

Proposed `package.json` scripts: `docs/release/proposals/team2/scripts.md` (do not apply from this worktree).

## Approval HOLDs

1. **Advertising storage GiB** — HOLD until owner confirms 1/5/20 vs alternative **256 MiB / 1 GiB / 5 GiB** (`STORAGE_ECONOMICS.md`).
2. **`INCLUDE_GRIN_IN_ACCOUNT_PURGE`** — stays **false**. Flip only after deletion policy + Play language are decided.
3. **`DELETION_GRACE_MS` 15 vs 180** — do not silently treat 180 as Play-compliant. See `DELETION_WINDOW_180_ASSESSMENT.md`. Team 4 also assesses. Not legal advice.
4. **Public deletion policy** — UNRESOLVED.
5. **Cloud Scheduler purge** — must not be wired from this module (`expired_purge_eligible` is SOURCE only).
6. **Live `firestore.rules` / `firebase.json` / `index.ts` / billing activation / Play listing** — coordinator.
7. **In-app copy** — `en.json` not changed (would advertise). Team 5: map outbox `monthly_quota_exhausted` to existing monthly-limit strings; map storage `quota_exhausted` without naming unconfirmed GiB.
8. **New callables** for cloud download/status — optional, not in this merge.

## What coordinator must do

1. Merge this worktree; regenerate packaging if combining with other teams (`packageFunctionsGoodsEvidence.ts`).
2. Leave `functions/src/index.ts` as-is.
3. Optionally add the Rules comment from `firestore.rules.grin-quota.md`.
4. Optionally add the `package.json` test scripts from `scripts.md`.
5. Do not deploy GRIN, do not enable `GRIN_GOODS_EVIDENCE_FUNCTIONS` / `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` from this slice.
6. Owner: confirm storage alternative vs proposal before any store/in-app GiB claim.
