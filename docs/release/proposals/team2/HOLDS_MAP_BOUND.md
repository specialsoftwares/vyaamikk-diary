# Holds-map bound (technical, not a customer entitlement)

`MAX_STORAGE_HOLDS = 2500` is a **technical entry limit** on the single Firestore
accounting document. It is **not**:

- a customer storage SKU or advertised file-count allowance
- proof that every permitted document will be accepted by Firestore
- a replacement for the proposed byte caps (1 / 5 / 20 GiB, unconfirmed)

The official Firestore document ceiling is **1,048,576 bytes**. Live write
acceptance is still Firestore’s. The estimator below uses the published
field-name + 32 B/field + nested-map model
(https://firebase.google.com/docs/firestore/storage-size) at **maximum
permitted identifier lengths** (ledgerId/evidenceId 64, derivativeKey 64,
uid 128).

## Size at maximum identifiers (estimator)

| Sample | Estimated document bytes | vs 1 MiB |
|---|---|---|
| 1,365 max-id originals (15 MiB PDF fill of proposed 20 GiB) | computed in `storageQuota.unit.test.ts` | under |
| 2,500 max-id originals | under | under |
| 2,500 max-id derivatives | under | under |
| 277 originals + 2,216 derivatives (15 MiB + 8×2 MiB near entry cap) | under | under |
| 660 originals + 5,280 derivatives (15 MiB + 8×2 MiB fill of 20 GiB) | **over** | cannot fit one document |

2,500 worst-case derivative keys leave tens of KiB of estimator headroom.
That is why the entry integer stays **2,500** rather than the ~2,750
estimator-only maximum: fail closed **before** an opaque Firestore
document-too-large write.

## Intended 15 MiB-PDF / proposed-cap workload

`floor(20 GiB / 15 MiB) = 1,365` originals. 1,365 < 2,500, and the max-id
document estimate is under 1 MiB. Starter 1 GiB and Professional 5 GiB
originals-only fills are also under. **No correction.** Raising the integer
cannot make a 15 MiB + 8-derivative fill of 20 GiB fit (~5,940 holds,
estimator over 1 MiB). That needs a sharded accounting document — out of
scope.

## What hits the entry limit first

- Tiny files (1 byte × 2,500 ≪ any proposed GiB cap)
- Full derivative fan-out (8 × 2 MiB per original) around **~8.4 GiB** of a
  proposed 20 GiB byte cap (277 groups × 9 holds)

Admission then returns `quota_state_invalid` with
`HOLDS_MAP_CAPACITY_DETAIL` (no GiB named). Existing holds are **not**
discarded. View / download / export of retained originals remain.

## Status fields

`holdCount` / `holdsCapacity` / `holdsAtCapacity` are ledger telemetry, not
a store entitlement.
