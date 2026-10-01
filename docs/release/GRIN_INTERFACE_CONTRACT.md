# GRIN interface contract — revision 2026-10-01.wave1b

Coordinator-owned. Teams implement against this text and `src/goodsEvidence/ports.ts`.
A contract change requires dependent teams to acknowledge and retest.

Not a live callable. GRIN stays default-off (`isGoodsEvidenceEnabled` + store-runtime block).
Do not enable production admission to demonstrate the feature.

Frozen ancestry: G1 `c9623dd` / PR #30. Domain `55f2df1` / PR #27 (support policy v2).
Core app `6e3dbba` / docs `8b286ab` / PR #29. Do not alter those PRs.

Wave 1b (this revision) answers Team 5 contract conflicts in `docs/release/proposals/team5/WAVE1_CONTRACT_REVIEW.md`. Dependent teams must acknowledge `2026-10-01.wave1b` and retest. The acceptance matrix was written against wave1; Team 5 re-acks after other teams land.

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
| authorized missing receipt (mutation) | `not_found` | only after owner/ledger checks; foreign callers still `forbidden` |

Hiding GRIN UI (`isGoodsEvidenceEnabled`) is **not** authorization. A callable/adapter must still enforce the table above if invoked (SEC-01).

`GrinDeny.detail` is an allowlisted generic string for operators and tests. Translated UI copy must not display `detail`. Auth/ledger denies use one generic detail so existence does not leak.

Durable adapter mappings (not the InMemory fixture):
- Domain `disabled` → `policy_denied`
- Owner/ledger mismatch → `forbidden` (not `digest_conflict`)

No pending-deletion replay exception.
Do not silently change existing auth or account-deletion policy. GRIN records are owner-scoped under `users/{uid}/…`. Retention/deletion of GRIN after `pending_deletion` / `retireIdentity` is an **unresolved policy dependency** (see register): deletion jobs must not be altered in this programme; document the requirement only.

Server registration/acceptance time is sampled per transaction attempt (`clock.nowMs()`). Test clocks are not live commit time. `firestoreCommitTime` remains null until a later slice that actually records it; it is excluded from hashes.

IST FY and serials use the **server** instant, not reported arrival. Crossing FY on retry reallocates against the new FY counter.

## Result / error shapes

Register: `GrinRegisterResult` (`ports.ts`). Mutations: `GrinMutationResult`. Reconcile: `GrinReconcileResult` for `ReconcileRequest { ledgerId, commandId }`.
Stored command documents include `commandType` plus the matching success shape. Reconcile of a mutation must not parse register-only fields.
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

Command types: `GoodsCommandType` in `command.ts` **must equal** `GrinCommandType` in `ports.ts`. Team 1 adds `recordEwbObservation` and `linkVerifiedEvidence` bodies; do not freeze those commands until the body types exist.

Event emission (Wave 1 commands only):

| Command | Event(s) |
|---|---|
| `registerGoodsReceipt` | `receipt_registered` |
| `amendFields` | `field_amended` |
| `recordQc` | `qc_decision` or `qc_reclassified` |
| `dispatchReturn` | `return_dispatched` |
| `correctReturnDispatch` | `return_received` |
| `voidWithReason` | `void_with_reason` |
| `recordEwbObservation` | `ewb_observation_recorded` (and `ewb_linked` only when linking an EBN, not cancelling) |
| `linkVerifiedEvidence` | `evidence_verified` |

`evidence_registered` is a Team 2 metadata/finalize event on the evidence object, not a ledger command. Reserved event types without a command (`acknowledgement_recorded`, `stock_reference_recorded`, `payment_reference_recorded`, `rejection_recorded`, `exception_resolved`) stay unimplemented until a later contract revision.

Admission: **new** register or mutation uses `newCommands` (matching digest replay when submit is allowed; no replay when submit is denied). **Reconcile** of any stored command (register or mutation) uses `reconciliation`. FY/serial do not change on mutations; `serverAcceptedAtUtc` is the attempt clock and may fall in a later FY than the issued number.

`recordEwbObservation` records portal/movement/QC histories independently (`ewb.ts`). Delivery does not cancel an EWB. Cancellation evidence retains reason, `goodsMoved` (unknown stays unknown), linked document, party, amount, replacement. Not a live portal.
`linkVerifiedEvidence` accepts only Team 2 `VerifiedEvidenceResult` (actual hash/size/generation, `EvidenceCategory`). Link is an event + pointer, not a rewrite of `original`.

## Evidence upload / verification / link

States and transitions: `EvidenceObjectState` / `EVIDENCE_STATE_TRANSITIONS`.
Completeness badge: `evidenceVerificationOfState` maps reserved/uploading/uploaded_unverified/orphan_pending_review → `pending`, rejected → `failed`, verified/linked → `verified`.
Original bytes are distinct from thumbnails/OCR/previews. Derivatives cannot claim a missing original is retained.
Client hash is a claim. Verification hashes stored bytes at the exact generation. Replacement after verification needs a new object id; it must not inherit the old verified result.
No cross-user dedup that leaks existence. No public bucket. No business details in object paths.
This is **not** encrypted-backup.

Wave 2 (W2-03 / W2-04, in flight): category is a declared `Wave1OriginalCategory` assertion, not proof of contents. Missing or unknown category **fails**; it is never coerced to `invoice`. Replay/recovery must re-validate owner, ledger, receipt association, evidenceId, hash, size and reservation identity even when an object is already verified or linked. Stored-byte verification is distinct from receipt linkage. `GrinEvidenceUploadResult` must return structured identity (`evidenceId`, `receiptId`, `ledgerId`, `category`, `claimedSha256`, `actualSha256`, `reservationId`; null when not durable) so the outbox can confirm **which** original became durable. Isolated Storage original **read** of retained `uploaded_unverified` / `verified` / `linked` objects is not gated on in-flight `reserved`/`uploading` reservations; stopping `newCommands` must not erase authorized retained reads. Overwrite/delete stay denied. Live production Rules remain unchanged.

## Offline queue

States: `OutboxLocalState` in `src/services/grin/outbox/**` (Team 3). `offline.ts` remains a labelled in-process fixture and is **not** the outbox. Unique key `(ownerUid, ledgerId, commandId)`. `dispatchGeneration` increments on each dispatch lease; A→logout→A cannot reuse another generation’s worker.
Queued digest is frozen; edits cannot silently mutate a command already sent.
Ambiguous network → reconcile/replay. Account switch: no dispatch or display of another owner’s work. Generation changes (A→logout→A) must not reuse the other generation’s in-flight worker.
Account retirement does not silently delete unsynchronised local evidence.
Host SQLite tests are not native process-death proof.

Wave 2 (W2-01 / W2-02, in flight): only an explicit session lifecycle owner may call `beginOwnerSession`. A repository, binding, or stale callback must never start a session to recapture authority. Bind reads/writes/publication to live uid **and** generation **and** ledger. Lease acquisition uses a unique attempt identity; the same worker name must not reclaim a live lease. After awaits, completion writes command/receipt/evidence in one SQLite transaction fenced by that attempt. An expired or superseded attempt must not clear a newer lease, rewind state, publish an issued number, or mark an original durable.

## Client / server boundary

Node/Admin G1 and G2 adapters under `tools/goods-evidence-*` are **INJECTED test composition**, not the production mobile boundary. Mobile `src/` must not import `firebase-admin`, Node `fs`, host SQLite, or emulator tools. Mobile-safe transport (Team 1, `src/services/grin/transport/**`) uses the Firebase JS client; server owner identity is authenticated context, never a client-supplied UID. Functions GRIN handlers stay unexported from `functions/src/index.ts`.

## Pack manifest

`assembleManifest` / `evaluatePackCompleteness` (support policy v2). Persist `PackAxes` (`integrity`, `coverage`, `completeness`). Never label incomplete as complete. Pin an operator-chosen event cut; the default UI pins the current head at export start. CS-07 tampers against that pinned cut. Missing/corrupt original → incomplete. Invoice reference ≠ retained invoice. Challan is not an invoice. ITC remains `not_determined`. A 2B assertion must not render as ITC-eligible. G4 ships all ten `ExceptionRuleId` evaluators; unimplemented evaluators are not allowed to imply clearance.

## Shared-read vs write contention

Per-owner admission document reads are **not** a global write lock. Serial allocation contends on `…/serials/{fyToken}` per owner+ledger+FY.

## Packaging

Production `functions/src/index.ts` must keep `lib/index.js` as the entrypoint.
`functions/src` must not import the Expo client runtime (`@/…`, React, localDb).
Shared domain for Functions: **generated copy or packaging script** from `src/goodsEvidence` (single source). Do not hand-duplicate rules. `freezeCommand` / `hashChain` cannot be copied while they import `@/utils/sha256Hex`; Team 1 must inject a Node hasher in the packaged copy. `featureFlag.ts` stays client-only and must not enter Functions.
G1 emulator adapter remains under `tools/goods-evidence-emulator/**` until packaging lands; then emulator tests call the same adapter surface.

Emulator ports (do not share processes): G1 historical Firestore **8088**; Team 1 mutations **8090**; Team 2 Firestore **8091** + Storage **9200**.

Live Rules: propose only under `docs/release/proposals/team1/firestore.rules.grin.md` and `docs/release/proposals/team2/storage.rules.grin.md`. Do not edit production `firestore.rules` / `storage.rules` in this programme. Unmatched Firestore paths already deny.

## Unresolved product / policy choices (do not invent)

- GRIN pricing / ordinary-record quota.
- Retention/deletion of GRIN + Storage objects after account deletion.
- Production admission flag, server admission, client visibility, deploy order (activation design later; not enabled here).
- Encrypted PDF backup (backlog).
- Live EWB / GSTR-2B / supplier-status integrations (manual assertions + `unknown` only).
