# Team 2 — S1 / S2 storage accounting handoff

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence`  
Branch: `team/grin-t2-evidence` (do not merge to `grin-combined` from this slice).  
If `origin/team/grin-t2-evidence` rejects a non-ff push, the same commit is on `team/grin-t2-s1s2`. Do not force-push.

## SHAs

| Pin | SHA |
|---|---|
| Coordinator HEAD this worktree started from (PR #31 after 41b05a4) | `e981587b77e8598cd6ea99286f71a5afe18db08e` |
| Application under test **before** `storageQuota` / adapter change | `b845e8a` |
| S1/S2 implementation | **this commit** on `team/grin-t2-evidence` |

P3 issuance quota was **not** changed and **must not** be regressed: first GRIN register consumes one monthly slot in the Admin transaction; replay/amend/QC/return/evidence/reconcile do not. INJECTED proof: `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` exit **0**.

Not done: deploy, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` (stays **false**), `DELETION_GRACE_MS` (stays 15 days), advertising GiB, purge scheduler, shared `package.json` / lockfiles / workflows / `app.json` / `eas.json` / `firebase.json` / `functions/src/index.ts` / repo-root `firestore.rules`.

## S1 reproduction (pre-fix, SHA `b845e8a`)

Helper `admitStorageReservation`: retained hold 900, cap 1000, new 200. `retainedOriginalBytes` **undefined** / **`"900"`** / **`0.5`** / **inconsistent `0`** → `ok: true`, charged **1100**.

Real G2 adapter + injected persistence (same four seeds): `reserve` **ok: true**, evidence object **written**, accounting **written**, charged **1100**. `numField` → `NaN`; `< 0` does not reject `NaN`; counters charged before hold recount.

Post-fix: parse and admit return `quota_state_invalid`; adapter writes **zero** evidence/accounting rows; corrupt document left untouched. Absent document still means empty (null) and may receive a first reservation. `repairAccounting` remains explicit/authorized and is not invoked from admission.

Firestore emulator transaction (post-fix): seeded inconsistent counters vs hold 900, cap 1000, new 200 → `quota_state_invalid`, evidence missing, accounting counters still 0.

## S2 reproduction (pre-fix, SHA `b845e8a`) — required before the identity fix

Same owner `owner_s1s2_repro`, two owned ledgers `ledger_s2_a` / `ledger_s2_b`, distinct receipts, **same** `evidenceId` `ev_shared_s2`. Real `adapter.reserve` twice (300 then 400 bytes).

| Item | Pre-fix result |
|---|---|
| Evidence path A | `users/…/goodsEvidenceLedgers/ledger_s2_a/evidenceObjects/ev_shared_s2` **exists** |
| Evidence path B | `users/…/goodsEvidenceLedgers/ledger_s2_b/evidenceObjects/ev_shared_s2` **exists** |
| Hold identities | **one** key: `original:ev_shared_s2` |
| Charged total | **300** (second 400 B not accounted) |
| `replayed` | both **false** |

Occupied-key short-circuit treated the second ledger as success without identity/size checks.

Post-fix (injected + emulator): two hold keys, charged **700**; identical replay of ledger A charges once (still 700); other owner isolated.

## Hold encoding

Length-prefixed, versioned, no separator dependence on id charset (ids remain `[A-Za-z0-9_-]{1,64}`):

- original: `1.o.{ledgerLen}.{ledgerId}.{evidenceLen}.{evidenceId}`
- derivative: `1.d.{ledgerLen}.{ledgerId}.{evidenceLen}.{evidenceId}.{derivLen}.{derivativeKey}`

Empty ids rejected. `parseStorageHoldKey` / `encodeStorageHoldKey` are the only codec. Same identity is used on reserve, retain, reject/release, repair, and derivatives. Replay succeeds only when ledger + evidence + kind + bytes match. Occupied key with a missing object, or mismatched size/kind, is `hold_conflict` / `quota_state_invalid` with **no writes**.

No live migration or backfill. Legacy `original:{evidenceId}` keys do not parse → existing corrupt docs fail closed. Tests-only path is the explicit `repairAccounting` inventory (complete identity objects), not a compatibility reader.

Owner remains the accounting document: `users/{uid}/goodsEvidenceStorage/accounting`. Object bytes remain at `evidenceObjectPath(uid, ledgerId, evidenceId)`.

## Holds-map bound

Firestore documents ≈ **1 MiB**. This map is **not** indefinite scale.

`MAX_STORAGE_HOLDS = 2500` (smallest reviewable integer that keeps the intended **15 MiB PDF** fill of proposed **20 GiB** ≈ 1,365 originals, and a 10 MiB-image fill ≈ 2,048, inside ~1 MiB with margin). Estimate ~300–450 bytes/hold.

Tiny files, or 8 derivatives × 1,365 originals (~12k holds), hit **this bound before the byte cap**. Admission then returns `quota_state_invalid` / `holds_map_at_capacity`. Not a product file-count SKU. Not advertised.

Wired caps remain **1 / 5 / 20 GiB** `PROPOSED_PENDING_OWNER_CONFIRMATION`.

## Files

| Role | Path |
|---|---|
| Authoritative helper | `tools/goods-evidence-storage/storageQuota.ts` |
| Authoritative adapter | `tools/goods-evidence-storage/adapter.ts` |
| Injected txn conflict | `tools/goods-evidence-storage/FAKE_injectedFirestore.ts` |
| Generated Functions copies | `functions/src/goodsEvidence/g2/{storageQuota,adapter}.ts` via `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` only |
| Helper regression | `tools/goods-evidence-storage/storageQuota.unit.test.ts` |
| Adapter + injected proof | `tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` |
| Emulator transaction proof | `tools/goods-evidence-storage/storageQuota.emulator.test.ts` |
| Economics | `docs/release/proposals/team2/STORAGE_ECONOMICS.md` |
| Proposed scripts (not applied to `package.json`) | `docs/release/proposals/team2/scripts.md` |
| Deletion inventory tests (flag false) | `functions/src/deletion/grinCleanup.unit.test.ts` |

## Tests + exit codes

| Command | Exit | Label |
|---|---|---|
| `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` | **0** | SOURCE packaging |
| `npx tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | **0** | PURE_DOMAIN helper (regression, not sole proof) |
| `npx tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | **0** | INJECTED G2 adapter (S1 zero writes, S2 two ledgers, replay, conflict, concurrent, isolate) |
| `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | **0** | INJECTED P3 issuance (no regression) |
| `npx tsx functions/src/deletion/grinCleanup.unit.test.ts` | **0** | INJECTED deletion lists; `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false` |
| `npm run typecheck:goods-evidence-g2` | **0** | SOURCE |
| `npm run test:goods-evidence-g2-unit` | **0** | INJECTED existing G2 suite |
| `firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json "npx tsx tools/goods-evidence-storage/storageQuota.emulator.test.ts && npx tsx tools/goods-evidence-storage/storage.emulator.test.ts"` | **0** | FIRESTORE_EMULATOR S1/S2 + existing G2 emulator |

Coordinator may add the proposed `package.json` scripts in `scripts.md`. Do not apply them from this worktree.

## Economics verdict

Bucket **`vyaamikk-diary.firebasestorage.app`**. Location **UNKNOWN** (anonymous GCS metadata HTTP 401; no `gcloud`/`gsutil`). **Do not substitute Functions `asia-south1`.**

Do not apply Firestore network free allowances to Cloud Storage. Do not assign project Always Free / Firestore daily free independently to every customer.

1 / 5 / 20 GiB remains **proposed pending confirmation** — **do not advertise**. 256 MiB / 1 GiB / 5 GiB is an **alternative, not a selected replacement**, and is **not** described as guaranteed profitable. No undisclosed download restriction. Heavy 20 GiB + repeated downloads can exceed business monthly net (assumed 15% store cut, no tax deducted) and exceed yearly-effective monthly net sooner. Normal usage can sit under starter monthly net in the labelled example.

## HOLDs

1. **Advertising storage GiB** — HOLD. Owner must confirm 1/5/20 vs alternative 256 MiB / 1 GiB / 5 GiB.
2. **`INCLUDE_GRIN_IN_ACCOUNT_PURGE`** — stays **false**. P8 public deletion **open**.
3. **`DELETION_GRACE_MS` 15 vs 180** — unchanged; 180 is not implemented and not Play-certified.
4. **Public deletion / retention policy** — UNRESOLVED.
5. **Cloud Scheduler / expiry purge** — not wired.
6. **Bucket location** — UNKNOWN until an authorized read of `storage.buckets.get`.
7. **Live Rules / `index.ts` / billing activation / Play listing / deploy** — coordinator.
8. **Holds-map 2,500 bound** — implementation ceiling; not a store SKU. Dense tiny files / full derivative fan-out hit it before the byte cap.
