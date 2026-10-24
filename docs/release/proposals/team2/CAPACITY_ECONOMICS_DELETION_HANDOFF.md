# Team 2 — capacity / economics / inactive deletion handoff

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence`  
Branch: `team/grin-t2-capacity` (do not force-push `origin/team/grin-t2-evidence`).  
Combined is coordinator-owned. S1/S2 not reopened.

## SHAs

| Pin | SHA |
|---|---|
| This slice parent (S1/S2) | `0cd3473ab5aee2d88d31662e29794839bd9ee8aa` |
| This implementation | **this commit** on `team/grin-t2-capacity` |
| Combined (read-only) | `aea65c1` |
| Application | `520f9f9` |
| CI cited by coordinator | `37425360211` on `0d7aa17` |

`INCLUDE_GRIN_IN_ACCOUNT_PURGE` remains **false**. `DELETION_GRACE_MS` remains 15 days. P8 public deletion **FAIL** (lists exist; not in default `USER_SUBCOLLECTIONS` / `USER_STORAGE_CATEGORIES`; 180-day not implemented; public window UNRESOLVED). Inactive cleanup is **not** an operational deletion service.

## Bound analysis

`MAX_STORAGE_HOLDS = 2500` is a **technical entry limit**, not a customer entitlement, not proof every document fits Firestore.

Estimator (official Firestore field-name + 32 B/field + nested map) at **max ids** (64/64/64, uid 128):

| Workload | Entries | vs 2,500 | vs ~1 MiB |
|---|---|---|---|
| 15 MiB PDF fill of proposed 20 GiB | 1,365 originals | under | under — **not blocked** |
| Same for proposed 1 GiB / 5 GiB | 68 / 341 | under | under |
| 2,500 max-id originals | 2,500 | at limit | under |
| 2,500 max-id derivatives | 2,500 | at limit | under |
| 15 MiB + 8×2 MiB near entry cap | 277 + 2,216 = 2,493 | at limit (~8.4 GiB) | under |
| 15 MiB + 8×2 MiB fill of 20 GiB | 660 + 5,280 = 5,940 | over | **over 1 MiB** |

No integer raise: the 15 MiB-PDF originals workload is not blocked; a full derivative fill cannot fit one Firestore document without redesign.

At capacity: admit fails closed (`holds_map_at_capacity` / `HOLDS_MAP_CAPACITY_DETAIL`); holds are not discarded; view/download/export of existing originals remain. `storageStatus` exposes `holdCount` / `holdsCapacity` / `holdsAtCapacity` as ledger telemetry, not a SKU.

## Economics (verified vs estimate)

| Item | Class | Value |
|---|---|---|
| Bucket name | verified SOURCE | `vyaamikk-diary.firebasestorage.app` |
| Bucket location | **UNKNOWN** | anonymous `storage.buckets.get` HTTP 401; no ADC; Functions `asia-south1` is not a substitute |
| GCS Standard stored (list) | verified page | $0.000027397 / GiB-hour ≈ $0.020 / GiB-month; asia-south1 unit **UNKNOWN** |
| GCS Class A/B (list) | verified page | $0.005 / $0.0004 per 1k (single-region Standard flat) |
| GCS internet egress (list) | verified page | $0.12 / GiB from the first GiB (worldwide/Asia excl. China) |
| Firestore / Always Free | project-level | **not** allocated per customer; Firestore network free **not** applied to GCS |
| Store cut 15%, GST not deducted, FX ₹84/USD | **ASSUMPTION** | labelled |
| Quarterly/yearly effective monthly net | derived from catalog | starter ~$0.84 / $0.67; business ~$4.38 / $3.37 after assumed 15% |

Owner must choose A (1/5/20, wired, unconfirmed) vs B (256 MiB/1/5 GiB, alternative, not guaranteed profitable) vs other. No silent replacement. No download restriction added.

## Deletion tests (flag false)

Behavioral INJECTED coverage: full GRIN inventory (ledgers, receipts, events, commands, serials, evidenceObjects, links, control, admission, uploadControl, object/derivative keys, accounting); storage originals + derivatives; other-owner isolation; interruption + retry; idempotent second run; actual empty verification; child-before-parent delete order. `force: true` is test-only. Default path is `grin_purge_disabled`.

| Command | Exit |
|---|---|
| `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` | **0** |
| `npx tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | **0** |
| `npx tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | **0** |
| `npx tsx functions/src/deletion/grinCleanup.unit.test.ts` | **0** |
| `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | **0** (P3) |
| `npm run typecheck:goods-evidence-g2` | **0** |
| `npm run test:goods-evidence-g2-unit` | **0** |
| `npx tsx src/goodsEvidence/entitlementLifecycle.test.ts` | **0** |

P8 stays **FAIL**.
