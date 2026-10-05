# Team 5 independent policy QA — Team 2 fold (T2)

AI QA / release-gate role, not human certification. Not live deploy. Not
G6. Not main merge. Not EAS/Play. **Do not enable GRIN. Do not mark
device / billing / public Done.** This file does not implement policy.

Worktree `team/grin-t5-qa` was **dirty** (prior `POLICY_QA.md` / README /
regression copies). It was **not** reset. Review notes are this new file
plus `issuance-non-register-no-consume.injected.ts`. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was read-only evidence.

Canonical CI `37351685421` is `5d5df3d` only — **not cited** for `b845e8a`.
SOURCE pass is not phone or store acceptance.

| Coordinate | Value |
|---|---|
| Application SHA reviewed | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` |
| Docs pin HEAD | `7761af65bb22a416f5e7da884f36c21355634e46` |
| Branch / PR | `integration/grin-g1-g5-source` PR #31 |
| Team 2 slice | `14e56f3802e29825708db591a5feb5bf8b000178` |
| Combined vs app SHA | docs-only (`GRIN_TEAM_BOARD.md`, `RELEASE_COMPLETION_REGISTER.md`) |
| Packaged vs tools G1/G2 | GENERATED header + import remap only |
| `GRIN_OPS_ALLOW_LIVE` | unset (no live mutate) |

---

## Prior findings (not reopened without new evidence)

| ID | Prior | This review |
|---|---|---|
| **P3** issuance allowance | Coordinator string-scan PASS after T2 fold | **PASS** independently on the production register transaction (INJECTED adapter, not only the SOURCE scan) |
| **P8** public deletion | Prefix / `USER_SUBCOLLECTIONS` FAIL; 180-day not implemented; lists behind `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false` | **FAIL** unchanged. Flag remains false. 15-day grace unchanged. 180-day still not implemented. Public-approved window still UNRESOLVED |

**New blockers:** none.

---

## PASS / FAIL / NOT RUN

| # | Item | Result | Labels |
|---|---|---|---|
| 1 | G1 `adapter.ts` + `quota.ts`: first register increments `usageCurrent` in the **same** Admin transaction; replay / mutate / QC / return / evidence / reconcile do not; `quota_exhausted` does not claim success; malformed usage is `quota_state_invalid`; enforcement off when status missing / `quotaEnforcementEnabled !== true` | **PASS** | SOURCE + INJECTED |
| 2 | Do **not** add `goodsEvidenceReceipts` to `firestore.rules` `quotaLinkedCollection` | **PASS** | SOURCE |
| 3 | G2 `storageQuota`: 80/95 warn, cap refuse, no silent delete, no overage, originals+derivatives, concurrent reservation / retry / abandoned / repair / downgrade-over-limit | **PASS** (adapter); true parallel EMULATOR **NOT RUN** | SOURCE + INJECTED |
| 4 | GiB constants labelled `PROPOSED_PENDING_OWNER_CONFIRMATION`; do not treat advertising as approved; alternative 256 MiB / 1 / 5 GiB is owner decision | **PASS** (labelling + not advertised in `src/`); economics **HOLD** | SOURCE |
| 5 | `entitlementLifecycle` 90+30; no Cloud Scheduler; `expired_purge_eligible` SOURCE only | **PASS** | SOURCE + INJECTED clock |
| 6 | `DELETION_GRACE_MS` still 15 days; `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`; `scheduledDeletionCleanup` must not purge live GRIN | **PASS** for those three facts. Public deletion/retention remains **P8 FAIL** | SOURCE + INJECTED |
| 7 | Export: pack `originalsBundled=false`; download original + receipt/audit export exist; ZIP optional | **PASS** | SOURCE + INJECTED |
| 8 | Account isolation, immutable history, evidence integrity, charges/entitlements, core-flow crashes, privacy leakage | **PASS** on SOURCE/INJECTED surfaces below. Device / Play / live **NOT RUN** | SOURCE + INJECTED |

Surfaces **NOT RUN** this assignment (do not equate with pass):
`SQLITE_HOST` pack re-exec, `EMULATOR` (G1/G2/Functions/Rules),
`MOUNTED_INERT_NATIVE`, `NATIVE_DEVICE`, `PLAY_INSTALLED`, `LIVE_BACKEND`.

---

## 1. Issuance quota — production path (P3)

**SHA / path:** `b845e8a` `functions/src/goodsEvidence/g1/adapter.ts` `register`
(~300–409) and `functions/src/goodsEvidence/g1/quota.ts`. Packaged from
`tools/goods-evidence-emulator/{adapter,quota}.ts` (header/imports only).

Production composition binds this adapter (`productionCompose.ts` →
`GoodsEvidenceRegisterAdapter`). Callables: `grinRegisterGoodsReceipt` /
`grinMutateGoodsReceipt` / `grinReconcileCommand` /
`grinReadGoodsReceipt`.

Independent trace (not a token scan):

1. First register reads `subscription/status` and
   `subscription/usageCurrent` **inside** `runAttempts` / `runTransaction`.
2. Replay (`commandSnap.exists`, matching digest) returns **before**
   `decideGrinIssuanceQuota` and **before** any `tx.set` — no increment.
3. `quota_exhausted` / `quota_state_invalid` return `deny()` (`ok: false`)
   **before** serial / receipt / event / command / usage writes.
   `classifyRegisterResult` maps both to **permanent** (not success).
   `parseRemote` lists them as deny codes.
4. `quota.kind === "write"` then `tx.set(usageRef, { ...quota.doc })` in the
   **same** callback as serial/receipt/event/command.
5. `mutate` / `reconcile` / `readReceipt` never import or call
   `decideGrinIssuanceQuota` and never touch `usageRef`.
6. Status missing or `quotaEnforcementEnabled !== true` →
   `enforcement_off` (no usage write). Failed status **read** throws (injected
   `status_read_failed`); issuance is not claimed.
7. `lastRecordCollection` label is `goodsEvidenceReceipts` (parallel value).
   Receipts live under `goodsEvidenceLedgers/.../receipts/{id}`, not a
   client-writable top-level collection.

INJECTED (this session): `quota.injected.unit.test.ts` exit **0**; Team 5
`issuance-non-register-no-consume.injected.ts` exit **0** (amend / QC /
return / link / reconcile leave `recordsThisMonth === 1` after first
register; replay does not increment). SOURCE lock
`issuance-monthly-allowance.regression.test.mjs` exit **0** (3/3).

---

## 2. Client Rules `quotaLinkedCollection`

**SHA / path:** `b845e8a` `firestore.rules` `quotaLinkedCollection` —
`purchaseOrders` \| `customerCreditRecords` \| `professionalPacks` \|
`entries` only. Repo-root Rules contain **no** `goodsEvidence` /
`grinEvidence` tokens (deny-by-default for unmatched client paths). Admin
SDK bypasses Rules for G1 usage writes.

Team 2 documented why adding `goodsEvidenceReceipts` to the matcher is the
**wrong path** (`docs/release/proposals/team2/firestore.rules.grin-quota.md`).
Coordinator correctly did not apply that comment into the function body
(the Team 5 lock would treat `goodsEvidence` in the slice as a matcher
change).

---

## 3. G2 storage quota

**SHA / path:** `b845e8a` `functions/src/goodsEvidence/g2/storageQuota.ts` +
`g2/adapter.ts` (`reserve`, `readAccountingAdmission`, `commitState`,
`repairAccounting`, `releaseAbandonedReservation`, `reserveDerivative`,
`downloadOriginal`).

| Behavior | Evidence |
|---|---|
| Warn 80 / 95 | `storageWarningFor`; reserve returns `storageWarning` without failing |
| Cap refuse | `admitStorageReservation` → `quota_exhausted`; object **not** created (INJECTED) |
| No success on refuse | `deny("quota_exhausted", ...)`; composed `parseEvidenceReserveResult` keeps `ok: false` |
| No silent delete | G2 adapter uses `blobs.stat` / `open` / `putIfAbsent` only. Production blob port has **no** delete. `repairAccounting` recounts; comment + test: receipt remains |
| No overage fee | Cap refuse only; no surcharge field |
| Originals + derivatives | Distinct hold keys; derivative path `.../derivatives/{id}`; `reserveDerivative` admits `kind: "derivative"` |
| Concurrent keys | Second reservation that would exceed cap is `quota_exhausted` (sequential INJECTED). True overlapping Admin tx **NOT RUN** (EMULATOR) |
| Retry | Same `evidenceId` + fingerprint while `reserved`/`uploading` is replay; `readAccountingAdmission(..., replay: true)` does not double-reserve. Expiry does not block that replay |
| Abandoned | `releaseAbandonedReservation` → `rejected` + `releaseReservedHold` in `commitState`. Size/mime mismatch on `completeUpload` also rejects and releases. **Not** in `PRODUCTION_GRIN_CALLABLE_NAMES` (adapter/INJECTED; complete-upload reject is the wired HTTPS path) |
| Repair | Rebuilds counters from inventory; does not delete blobs. **Not** a production callable |
| Downgrade over limit | `overLimitRetained`; new reserve refused; retrieve/view still ok (INJECTED) |
| Enforcement off | Status missing → `storageCapBytesFromStatus` `enforcement_off`; reserve succeeds without accounting write |

`repairAccounting` / `releaseAbandonedReservation` are **not** HTTPS
exports. That is not a new public blocker while GRIN is undeployed.
Abandoned reservations that never enter complete-upload stay reserved
until an adapter-level release (no TTL sweeper). Observation, not P-level.

INJECTED: `storageQuota.injected.unit.test.ts` exit **0**.

---

## 4. GiB constants — not approved advertising

```ts
PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES
  free: 0, starter: 1 GiB, professional: 5 GiB, business: 20 GiB
OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES
  free: 0, starter: 256 MiB, professional: 1 GiB, business: 5 GiB
```

`storageCapBytesFromStatus` **wires the proposed map** when
`quotaEnforcementEnabled === true`. The alternative is **not** wired.
`src/` has **no** "1 GiB" / "5 GiB" / "20 GiB" product strings.
`labels.ts` says caps must not be advertised.

Do **not** treat 1/5/20 as owner-approved or Play-listing copy. Alternative
256 MiB / 1 / 5 GiB remains an owner decision (`STORAGE_ECONOMICS.md`).

---

## 5. Entitlement lifecycle

**SHA / path:** `src/goodsEvidence/entitlementLifecycle.ts` (packaged copy
under `functions/src/goodsEvidence/entitlementLifecycle.ts`).

90-day read/export + 30-day final notice, injected `nowMs`.
`expired_purge_eligible` is a phase label only. `mayReadDownloadExportGrin`
returns true through purge-eligible. `mayIssueOrUploadGrinCloud` is true
only for `entitled_or_free`. G1 register and G2 new reserve call that
gate.

No `onSchedule` / pubsub in this module. `functions/src/index.ts` does not
import it. Existing `scheduledDeletionCleanup` is **account-deletion**
grace (15-day diary), not GRIN expiry purge.

INJECTED clock: `entitlementLifecycle.test.ts` exit **0**.

---

## 6. Deletion (P8 remains FAIL)

**Implemented facts (PASS as stated):**

- `DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000` in
  `functions/src/deletion/finalPurge.ts`; `DELETION_GRACE_DAYS = 15` in
  `src/domain/identityLifecycle.ts`. No 180-day grace write.
- `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` in `grinCleanupLists.ts`.
- `purgeGrinEvidenceIfEnabled` returns idle `grin_purge_disabled` unless
  the flag is true or `force: true` (unit tests only).
- `runFinalAccountPurge` only calls GRIN cleanup inside
  `if (INCLUDE_GRIN_IN_ACCOUNT_PURGE)`.
- `USER_STORAGE_CATEGORIES` remains `letterhead` \| `attachments` \| `pdfs`.
  `USER_SUBCOLLECTIONS` has no `goodsEvidence*` / `grinEvidence*`.
- `scheduledDeletionCleanup` → `runFinalAccountPurge` therefore does **not**
  purge live GRIN while the flag is false.

**P8 public deletion/retention still FAIL** (same defect class as
`5d5df3d`; T2 lists do not close it):

- Default storage purge prefixes still omit `"grinEvidence"`.
- Default Firestore purge still omits GRIN trees (and the first-level
  loop would not recurse ledger children even if names were appended).
- Public-approved retain/delete window is UNRESOLVED. 180 requested ≠
  implemented ≠ Play-certified.

Reusable recursive lists exist in `grinCleanupLists.ts` /
`grinCleanup.ts` for a future owner+coordinator flag flip. That is not
public-policy closure.

SOURCE suite `public-deletion-retention.regression.test.mjs` at `b845e8a`:
**2 fail / 2 pass**, exit **1**. Fails: quoted `"grinEvidence"` in
`userOwnedStoragePaths.ts`; GRIN ids in `firestorePurge.ts`. Passes:
comment-level `grinEvidence` token now present in `userOwnedStoragePaths.ts`
(weaker than a list lock); 180 not implemented.

INJECTED: `grinCleanup.unit.test.ts` exit **0**.

**Smallest correction (unchanged):** keep 15-day diary grace; do not flip
the flag or write 180 without nested GRIN purge **and** a public-approved
window. Then authorized Functions change to default prefixes + recursive
trees + listing disclosure.

---

## 7. Export

- Pack / repository still `originalsBundled: false`,
  `bundledArtifacts: "none"`, `exportKind: "manifest_and_pdf_summary"`.
- `downloadGrinOriginal` + G2 `downloadOriginal` exist (missing / corrupt /
  too_large / session_retired / derivative_not_original; 64 MiB / 48 files).
- `assembleReceiptAuditExport` (`originalsBundled: false`,
  `packIsCompleteArchive: false`).
- `assembleOptionalOriginalZip` is optional STORE ZIP (PK header asserted).

G2 `downloadOriginal` is **not** in `PRODUCTION_GRIN_CALLABLE_NAMES`.
Client/local + adapter paths exist in SOURCE. Live Storage rules still have
no `grinEvidence` (undeployed). Not LIVE_BACKEND.

INJECTED: `receiptAuditExport.test.ts` exit **0**.

---

## 8. Isolation / integrity / charges / crashes / privacy

| Concern | Result | Notes |
|---|---|---|
| Account isolation | **PASS** SOURCE/INJECTED | G1 `gate` requires `ledger.ownerUid === uid`; foreign mutate `forbidden` (`mutations.injected.unit.test.ts`). Module isolation contract forbids diary/billing/PDF imports |
| Immutable history | **PASS** INJECTED | `persisted.original = cloneSnapshot(receipt.original)`; amend does not rewrite original remarks |
| Evidence integrity | **PASS** SOURCE/INJECTED | Digest/receipt_exists; stored-byte hash; generation mismatch → reject; no invented issued numbers in `parseRemote` |
| Charges / entitlements | **PASS** SOURCE | `GRIN_INCLUDED_IN_EXISTING_PLANS = true`; no GRIN SKU in `src/` strings; ordinary monthly cap shared via `usageCurrent` |
| Core-flow crashes | **PASS** INJECTED adapters; **NOT RUN** NATIVE_DEVICE | Register/mutate/quota/storage/export scripts this session did not throw. Feature flag default-off (`featureFlag.test.ts` exit 0) |
| Privacy leakage | **PASS** SOURCE | G1/G2 logs: allowlisted primitives only; no bodies, hashes, filenames, URLs. Default log env off |

---

## Tests this session (combined tree `7761af6` / app `b845e8a`)

| Command | Label | Exit |
|---|---|---|
| `node --test docs/release/proposals/team5/issuance-monthly-allowance.regression.test.mjs` | SOURCE | **0** (3 pass) |
| `node --test docs/release/proposals/team5/public-deletion-retention.regression.test.mjs` | SOURCE | **1** (2 fail / 2 pass) — expected until P8 closes |
| `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED | **0** |
| `GRIN_QA_REPO_ROOT=… npx tsx docs/release/proposals/team5/issuance-non-register-no-consume.injected.ts` (team/grin-t5-qa) | INJECTED | **0** |
| `npx tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED | **0** |
| `npx tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED | **0** |
| `npx tsx src/goodsEvidence/entitlementLifecycle.test.ts` | SOURCE / INJECTED clock | **0** |
| `npx tsx src/services/grin/export/receiptAuditExport.test.ts` | INJECTED | **0** |
| `npx tsx functions/src/billing/products.unit.test.ts` | SOURCE | **0** |
| `npx tsx src/billing/optionC/usageTransition.test.ts` | SOURCE | **0** |
| `npx tsx tools/goods-evidence-emulator/mutations.injected.unit.test.ts` | INJECTED | **0** |
| `npx tsx src/goodsEvidence/isolation.contract.test.ts` | SOURCE | **0** |
| `npx tsx src/goodsEvidence/featureFlag.test.ts` | SOURCE | **0** |

EMULATOR / SQLITE_HOST / NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND:
**NOT RUN**.

---

## Verdict

Team 2 fold at `b845e8a` implements issuance consumption on the **production
register transaction** and storage/expiry/export source as specified.
**P3 PASS. P8 FAIL.** No new blockers. Do not advertise GiB. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not wire an expiry purge scheduler.
Do not treat this review as device, billing, or public Done.
