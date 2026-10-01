# GRIN interface contract — revision 2026-10-01.wave1

Coordinator-owned. Teams implement against this text and `src/goodsEvidence/ports.ts`.
A contract change requires dependent teams to acknowledge and retest.

Not a live callable. GRIN stays default-off (`isGoodsEvidenceEnabled` + store-runtime block).
Do not enable production admission to demonstrate the feature.

Frozen ancestry: G1 `c9623dd` / PR #30. Domain `55f2df1` / PR #27 (support policy v2).
Core app `6e3dbba` / docs `8b286ab` / PR #29. Do not alter those PRs.

## Identifiers

| Kind | Scope | Rules |
|---|---|---|
| `commandId` | owner + ledger + commandId | `[A-Za-z0-9_-]{8,128}`. Digest identity. |
| `receiptId` | owner + ledger + receiptId | `[A-Za-z0-9_-]{1,64}`. `receipt_exists` cannot be bypassed with a new commandId. |
| `ledgerId` | owner + ledger | Same charset. Auth uid wins over envelope `ownerUid`. |
| `evidenceId` | owner + ledger + evidenceId | Same charset. **Object storage paths use a separate random object key**, never business fields. |
| `eventId` | receipt event stream | Server UUID. |
| `lineId` | within a receipt | `[A-Za-z0-9_-]{1,64}` excluding `__proto__` / `constructor` / `prototype` (never rewritten). |

IDs are never rewritten into another identifier.

## Auth, session, permissions

Trusted identity is the authenticated Firebase uid, not the body.
Checks, in order: unauthenticated → user doc / `pending_deletion` / inactive → ledger owner + `active` → admission config → command validation.

| Failure | Code | Leakage |
|---|---|---|
| missing uid | `unauthenticated` | — |
| missing/inactive user, pending_deletion, foreign/retired ledger | `forbidden` | generic deny; no existence leak |
| admission missing/malformed or gated | `policy_denied` | denied reconcile does not reveal whether the command exists |
| authorized missing command (reconcile only) | `not_found` | only after owner/ledger/admission allow reconciliation |

No pending-deletion replay exception.
Do not silently change existing auth or account-deletion policy. GRIN records are owner-scoped under `users/{uid}/…`. Retention/deletion of GRIN after `pending_deletion` / `retireIdentity` is an **unresolved policy dependency** (see register): deletion jobs must not be altered in this programme; document the requirement only.

Server registration/acceptance time is sampled per transaction attempt (`clock.nowMs()`). Test clocks are not live commit time. `firestoreCommitTime` remains null until a later slice that actually records it; it is excluded from hashes.

IST FY and serials use the **server** instant, not reported arrival. Crossing FY on retry reallocates against the new FY counter.

## Result / error shapes

Register: `GrinRegisterResult` (`ports.ts`). Mutations: `GrinMutationResult`.
Replay of a stored matching digest returns the original result with `replayed: true` and **zero writes**.
`digest_conflict`: same commandId, different digest, while submit is allowed.
`version_conflict`: expected stream version mismatch (mutations).
`voided`: mutation against a voided receipt.
`integrity` / `serial_exhausted`: existing FY counter malformed / exhausted (zero writes; no repair; no serial reuse).

Client-supplied server fields (`issuedNumber`, serial, hashes, `firestoreCommitTime`, …) are rejected.

Logging: fixed event names, bounded metadata only. No request bodies, descriptions, raw errors, or document bytes. `grin_g1_committed` (and later mutation committed names) emit **once after** `runTransaction` resolves, never on abort/replay. Retry only gRPC/Firestore ABORTED (`10` / `"ABORTED"` / `"aborted"`). Message text is not a retry classifier.

## Canonicalization and schema

`GOODS_EVIDENCE_SCHEMA_VERSION = 1`. `CANONICAL_JSON_VERSION = "1"`.
Canonical JSON: sorted keys, explicit nulls, **omit undefined object properties**, reject undefined/sparse array entries, reject prototype keys, reject non-plain objects.

**Undefined-object contract (G1 correction):** `{ optional: undefined }` is the same command as omitting `optional`. Adapter input validation must normalize a **copy** (do not mutate caller input) by omitting undefined object properties **before** digest/validation/persistence. Required fields still fail if absent after omit. Undefined/sparse **array** entries remain `invalid`. Do not treat database/clock/UUID/commit failures as `invalid`.

## Registration / amendment / events

Register (`registerGoodsReceipt`) issues an immutable `original` snapshot, first `receipt_registered` event, command result, serial, and projections. Later commands **append events** and update `view` / line ledgers / `effective` copy. They never overwrite `original`.

Mutations require: trusted identity, scoped idempotency (`commandId`+digest), `expectedVersion`, atomic event+projection+command-result. Lost responses recover via stored command result (replay) or reconcile.

Command types: see `GrinCommandType` in `ports.ts`.
`recordEwbObservation` records portal/movement/QC histories independently (`ewb.ts`). Delivery does not cancel an EWB. Cancellation evidence retains reason, `goodsMoved` (unknown stays unknown), linked document, party, amount, replacement. Not a live portal.
`linkVerifiedEvidence` accepts only Team 2 `VerifiedEvidenceResult` (actual hash/size/generation). Link is an event + pointer, not a rewrite of `original`.

Admission matrix for **newCommands / reconciliation** is unchanged from G1 `ARCHITECTURE.md`. Mutations use `newCommands` the same way as register (matching digest replay when submit allowed; no replay when submit denied).

## Evidence upload / verification / link

States and transitions: `EvidenceObjectState` / `EVIDENCE_STATE_TRANSITIONS`.
Original bytes are distinct from thumbnails/OCR/previews. Derivatives cannot claim a missing original is retained.
Client hash is a claim. Verification hashes stored bytes at the exact generation. Replacement after verification needs a new object id; it must not inherit the old verified result.
No cross-user dedup that leaks existence. No public bucket. No business details in object paths.
This is **not** encrypted-backup.

## Offline queue

States: `OutboxLocalState`. Local records never invent `issuedNumber` or `serverRegisteredAtUtc`.
Queued digest is frozen; edits cannot silently mutate a command already sent.
Ambiguous network → reconcile/replay. Account switch: no dispatch or display of another owner’s work. Generation changes (A→logout→A) must not reuse the other generation’s in-flight worker.
Account retirement does not silently delete unsynchronised local evidence.
Host SQLite tests are not native process-death proof.

## Pack manifest

`assembleManifest` / `evaluatePackCompleteness` (support policy v2). Pin event cuts and evidence generations. Missing/corrupt original → incomplete. Never label incomplete as complete. Invoice reference ≠ retained invoice. Challan is not an invoice. ITC remains `not_determined`.

## Shared-read vs write contention

Per-owner admission document reads are **not** a global write lock. Serial allocation contends on `…/serials/{fyToken}` per owner+ledger+FY.

## Packaging

Production `functions/src/index.ts` must keep `lib/index.js` as the entrypoint.
`functions/src` must not import the Expo client runtime (`@/…`, React, localDb).
Shared domain for Functions: **generated copy or packaging script** from `src/goodsEvidence` (single source). Do not hand-duplicate rules.
G1 emulator adapter remains under `tools/goods-evidence-emulator/**` until packaging lands; then emulator tests call the same adapter surface.

## Unresolved product / policy choices (do not invent)

- GRIN pricing / ordinary-record quota.
- Retention/deletion of GRIN + Storage objects after account deletion.
- Production admission flag, server admission, client visibility, deploy order (activation design later; not enabled here).
- Encrypted PDF backup (backlog).
- Live EWB / GSTR-2B / supplier-status integrations (manual assertions + `unknown` only).
