# S1 / S2 storage accounting — merge constraint

Pre-fix checkpoint: application `b845e8a` / PR head `41b05a4`.
P3 issuance quota stays accepted unless a new failure is shown.
Do not flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not change `DELETION_GRACE_MS`.
Do not advertise GiB. Packager only for generated Functions copies.

## S1 — malformed or inconsistent accounting must not bypass the cap

`numField` can yield `NaN`. `parseStorageAccounting` rejects counters with
`< 0`, which does not reject `NaN`. `admitStorageReservation` charges
counter fields before recounting holds. Helper: retained hold 900, cap
1000, new 200, `retainedOriginalBytes` undefined / `"900"` / `0.5` / `0`
→ `ok:true` and usage 1100.

Required:

- Finite nonnegative **safe integers** for bytes and **safe sums**.
- Consistency: hold inventory totals must match the four counter fields
  **before** admitting a new reservation.
- Absent accounting document → empty (null). Existing corrupt document →
  classified `quota_state_invalid`, **zero** reservation/accounting writes.
- Do not silently reset, discard holds, or repair inside admission.
- Explicit `repairAccounting` stays separate and authorized.
- Preserve originals, receipt history, replay.

Proof: G2 adapter + injected persistence first; then Firestore emulator
transaction. Keep the helper as a regression, not the sole proof.

## S2 — hold identity must include the full durable evidence identity

Today: `evidenceObjectPath(uid, ledgerId, evidenceId)` but
`originalHoldKey(evidenceId)` and account-wide `storageAccountingPath(uid)`.
Replay of an occupied key is success without checking identity/size/kind.
Same `evidenceId` on two owned ledgers under one cap can collide.

Required:

- Bind holds to complete durable identity (owner is the document; include
  **ledgerId** + evidenceId + kind).
- Unambiguous encoding (no separator collisions). Reject empty ids.
- Replay proves identity equivalence (ledger, evidence, kind, bytes), not
  merely an occupied key.
- Same identity on reserve, retain, reject/release, repair, derivatives.
- Conflicting size/kind/identity → fail closed, no writes.
- No invented live migration or backfill. If a versioned compatibility
  path is needed for tests only, document it; default new writes use the
  complete key.

Tests: identical replay once; same evidenceId different ledgers separately;
cross-owner isolated; conflict fail-closed; concurrent near-cap cannot both
exceed; verify/reject/retry cannot move another item's hold.

## Implementation status (coordinator fold)

Landed on combined as `520f9f98bc952fd7f30a907da9e85774629a69c0` (cherry-pick
of `0cd3473`). Independent Team 5 post-fix review **pending**. Canonical GHA
for this SHA **NOT YET**. Do not cite `37379529193`. Do not pin Functions.
Do not advertise GiB. P8 unchanged (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`).

## Bounded holds map

Firestore documents are bounded (~1 MiB). Document the max hold-map size
the schema intends. Do not claim indefinite scale. If that bound blocks
the intended 15 MiB-PDF workload at the proposed caps, implement the
smallest reviewable bound (e.g. max hold entries) — no speculative
redesign.
