# GRIN interface contract — revision 2026-10-02.wave2evidence

Coordinator-owned. Teams implement against this text and `src/goodsEvidence/ports.ts`.
A contract change requires dependent teams to acknowledge and retest.

Not a live callable. GRIN stays default-off (`isGoodsEvidenceEnabled` + store-runtime block).
Do not enable production admission to demonstrate the feature.

Frozen ancestry: G1 `c9623dd` / PR #30. Domain `55f2df1` / PR #27 (support policy v2).
Core app `6e3dbba` / docs `8b286ab` / PR #29. Do not alter those PRs.

Wave 1b (`2026-10-01.wave1b`) answered Team 5 contract conflicts. `2026-10-02.wave2app` added F1–F4. This revision adds evidence-workflow findings **E1–E5**. Dependent teams must acknowledge `2026-10-02.wave2evidence` and retest. W2-01…W2-05 and F1–F4 remain in force; do not regress them.

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

## Application findings F1–F4 (2026-10-02.wave2app)

These are distinct from W2-01…W2-05. PHASE 2 host/mount tests do **not** close them.

### F1 — Screen callback ownership (Team 4, with Team 3)

Cause: production screens call `requireLiveGrinApplicationRepository()` at dispatch. After A→B, A's callback mutates B.

Required properties:

- Bind every production action (create, amend, QC, return, EWB, file selection, export/share, navigation) to the **originating** `{ ownerUid, dispatchGeneration }` and that generation's repository.
- Validate origin against live in-memory authority **and** `outbox.isSessionCurrent` before dispatch and after every await.
- Never recapture the current account (`requireLiveGrinApplicationRepository`) to authorize an old callback.
- `GrinAdmissionGate` must pass the host session into admitted bodies. `{() => children}` is forbidden.
- Mask/reset retired form values, records, and selected attachments on origin mismatch / logout.
- Immediate stale-action rejection must work **before** React owner effects run.
- Connect lifecycle ownership to existing app session authority (`isBindingLive` + sqlite generation).
- Remove sqlite `beginOwnerSession` / `endOwnerSession` from the React **render function** without an effect-window bypass: the in-memory live token (uid+generation) must flip synchronously when the admitted owner changes so A's captured origin fails immediately even if sqlite retirement is deferred. Team 3 may expose `advanceLiveToken` / in-memory generation if sqlite must not run in render.
- Tests must execute the **actual production screen action binding or admitted body** with inert native surfaces. Do not substitute an inert child whose callback binds ownership differently. Cover A→B and A→logout→A.

`getGrinApplicationRepository(ownerUid, dispatchGeneration)` is the dispatch entry. Team 4 should add `requireOriginGrinApplicationRepository(origin)` rather than recapturing live.

### F2 — Server-confirmed state and valid mutations (Teams 1, 3, 4)

`GrinApplicationRepository.clientExpectedVersion()` returning `0` is invalid (`expectedVersion must be a positive integer`). Do not replace `0` with a guessed constant or local queue count.

Contract types (coordinator, `ports.ts`): `GrinConfirmedProjection`, `GrinReceiptReadResult`, `GRIN_NO_CONFIRMED_VERSION`.

- Team 1: authorized retrieve of confirmed original, events, effective, `eventVersion`, `headHash`. Attach the same projection on register/mutate/reconcile **success** (or a dedicated `readReceipt` on composed + JS transport). Validate remote result shapes before the client accepts them. Recheck auth/session after network awaits. Keep Functions unexported. Isolated emulator composition is the proof path.
- Team 3: durable sqlite confirmed projection **separate** from pending commands. Additive v10 columns only (no `DB_VERSION` bump). Persist confirmation only from a validated server success/read. Command ids/digests stay immutable; no silent rebase of a submitted command. Sequential mutation: do not dispatch mutation N+1 until N is confirmed or conflicted. Queued EWB/return rows are **not** confirmed history.
- Team 4: `expectedVersion` is `confirmed.eventVersion` when present. If no confirmed version: retain the user's draft/intention locally and **do not** submit. Show pending / failed / conflicted operations separately from accepted events. Accepted amend/QC/return must appear in **effective**; original snapshot/hash unchanged.

Required joined test (Team 3 owns `tools/grin-interop`, uses T1 INJECTED adapter + T4 repository, SQLITE_HOST + INJECTED, not NATIVE_DEVICE):

Application repository creates receipt → G1 composition accepts → confirmation persists → repository creates amendment → G1 accepts → reopen sqlite / restart outbox shows updated effective and unchanged original.

Also: QC, partial return, EWB observation, intervening `version_conflict`, lost-response recovery via reconcile/read. Label SQLITE_HOST / INJECTED. Do not claim emulator unless `FIRESTORE_EMULATOR_HOST` is set and the emulator path actually runs.

### F3 — Attachments and real evidence packs (Teams 2, 4, with Team 3)

Attachments today only list. `exportPack()` hardcodes empty cuts and `missingOriginal: true`. Honest placeholders are not functional completion.

- Team 4: platform-safe capture/select (reuse existing picker gates; inject a test picker). Explicit `Wave1OriginalCategory`. Owner/session-bound picker and upload completion (F1 origin).
- Team 3: durable local-original handling; do not release local bytes until verified generation; bounded concurrency (`MAX_CONCURRENT_UPLOADS_PER_OWNER`); no full-file base64 upload path.
- Team 2: upload → stored-byte verification → receipt linkage → authorized retrieval. Persist structured identity (`GrinEvidenceUploadResult`). Recovery without duplicate evidence. Isolated Storage emulator remains the live-Rules-unchanged proof path.

Pack: assemble from **persisted confirmed** events, snapshot anchors, associations, and originals at a pinned cut (`assembleManifest` / support policy v2). Invoice reference is not an invoice original. Missing/unknown remains incomplete. ITC always `not_determined`. Hashes are not legal truth.

Both paths required:

A. Missing evidence → export with explicit gaps (`mayMarkComplete` false).
B. Correctly associated evidence satisfying coverage policy → policy-complete pack (`mayMarkComplete` true) without forcing completeness.

### F4 — Mobile transport integration (Team 1, Team 4, coordinator)

`e6a689b` is on combined: production default `createFirebaseJsGrinTransport`. SQLITE_HOST tests inject FAKE. Coordinator added `appBinding.defaultServerPort.unit.test.ts` to `test:grin-product`. That source-graph test is **not** an executed application/backend test.

Still required:

- Validate remote result shapes before durable acceptance (do not `as GrinRegisterResult` blindly).
- Recheck session/attempt ownership after network awaits.
- Complete corresponding evidence transport/composition (mobile JS client; server identity from callable auth). Isolated emulator composition proves the connected flow.
- Unavailable backend/configuration failures stay explicit (`policy_denied` / unexported callable errors). Do not swallow.
- Mobile `src/` must not import `firebase-admin`, Node `fs`, HostSqlite, or `tools/goods-evidence-*` adapters.
- Production Functions exports remain HOLD. Absence does not block undeployed composed/emulator tests. Do not edit `functions/src/index.ts`.

## Evidence workflow findings E1–E5 (2026-10-02.wave2evidence)

Starting combined HEAD `13f90ed` / validated application `99ee60c`. Preserve F1–F4 and W2-01…W2-05.

### Default production composition

`persistGrinOwnerSession` must construct:

```
new GrinOutbox({
  db,
  server: serverPortFactory(),
  evidence: evidencePortFactory(),
  localOriginalHasher: hasherFactory(),
})
```

- Default `serverPortFactory` remains `createFirebaseJsGrinTransport`.
- Default `evidencePortFactory` is `createFirebaseJsGrinEvidenceTransport` (Team 1). Tests inject FAKE / uninjected / null via `setGrinEvidencePortFactoryForTests` (Team 4, same pattern as the server factory).
- Default `hasherFactory` is `createAppLocalOriginalHasher` (APP_FILESYSTEM / Expo FileSystem; tests inject SQLITE_HOST node-fs via `setGrinLocalOriginalHasherFactoryForTests`). Without a hasher, admission fail-closes (`originalDurable: false`).
- `evidence: undefined` is not a production default. A missing **backend** (unexported callable, unauthenticated, network) must yield `attachment_pending` / retryable deny with `originalDurable: false`, never success.
- Default-off / store-blocked admission must not start GRIN services. Hiding UI is not authorization.
- Mobile `src/` must not import Admin SDK, Node `fs`, HostSqlite, or `tools/goods-evidence-*`. Isolated Functions-emulator entrypoint lives under `tools/goods-evidence-emulator/**` and may compose the same production handler factories. Do **not** export GRIN from `functions/src/index.ts`.

### E1 — App evidence port (Team 1 + Team 2; Team 4 wires `appBinding`)

At `99ee60c` the outbox was constructed without `evidence`, so `processAttachments` returned `attachment_pending`, and the JS evidence transport voided `localPath`. Combined production composition now supplies `evidencePortFactory()` and `hasherFactory()`. Isolated emulator proof: `tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts` runs both a direct JS transport upload and `persistGrinOwnerSession` → `processAttachments` → real `httpsCallable` (not mocked). Remaining injected boundaries are listed in that file (emulator hosts, auth token, Admin seed, SQLITE_HOST, HOST_FILESYSTEM chunk reads / node `readFile`). Live `functions/src/index.ts` stays unexported.

Required connected path (not a pre-injected successful `GrinEvidenceUploadResult`):

1. Retain local original bytes (E4) and queue `attachOriginal`.
2. Reserve (G2 reservation identity).
3. Upload retained bytes via Firebase **JS** Storage (chunked / resumable; no full-file base64 logging).
4. Trusted verify hashes **stored** bytes at the returned generation.
5. Link via `linkVerifiedEvidence` (event + pointer; never rewrite `original`).
6. Reopen sqlite / restart outbox: original remains durable with the server descriptor.

Acceptance: production composition with platform/auth/network redirected to **local emulators**. Do not mock `httpsCallable` in the round-trip case. Document any remaining injected boundary (auth test user, emulator hosts, Feature flag `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the **emulator process only**).

### E2 — Verification admission (Team 2 + Team 3)

`originalIdentityMatches` must **not** accept (a) echoed client claim when `actualSha256` differs, or (b) null local claim and null returned hashes when other IDs match.

Before marking durable:

- `uploaded.ok && originalDurable` is **not** sufficient.
- `actualSha256` must be `isSha256Hex` and must equal the hash of the **captured local retained bytes** (bounded chunks). An echoed `claimedSha256` cannot substitute.
- Match owner (auth uid), ledger, receipt, evidenceId, category, measured `sizeBytes`, storage object identity (`storagePath` / object key) and actual generation.
- Reject missing, malformed, mismatched, stale, wrong-owner/receipt/ledger/category/evidenceId, invalid generation, size mismatch.
- Session retirement / lease takeover after the await must not persist durability (`ownsLiveAttempt` / `skipStaleCompletion` already required by W2-02).
- Hash equality proves byte integrity, not document truth or legal sufficiency.

Extend `GrinEvidenceUploadResult` (Team 3 `outbox/ports.ts`) so a durable success includes: `ownerUid`, `mime`, `sizeBytes`, `storagePath`, `generation` (real object generation, never the literal `"verified"`), `actualSha256`, `reservationId`, plus existing identity fields. Non-durable results keep identity fields null.

Required tests: the listed negatives plus one positive case with known bytes and independently computed SHA-256.

### E3 — Trusted verification metadata (Team 3)

`writeEvidenceUpload` must persist the verified descriptor atomically under the current session and attempt fence: actual hash, size, MIME, object identity/generation, association, capture provenance. Keep `claimed_sha256` distinct from `actual_sha256`.

Additive SQLite only (no `DB_VERSION` bump, do not rewrite `migrateToV10` CREATE TABLE). Idempotent `ALTER TABLE ... ADD COLUMN` via `tableHasColumn`, same pattern as confirmed-projection columns.

Older rows without trustworthy descriptors remain pending/incomplete. Do not backfill fictional generations, hashes, or provenance.

`toPackOriginalInput` (Team 4) must use the retained **actual** hash, MIME, and generation. Remove `generation: "verified"` substitution and filename MIME guessing when a descriptor exists.

Stale completion must not overwrite a newer descriptor or make another receipt's original durable. SQLITE_HOST reopen must show the exact descriptor.

Team 3 must **remove** `bindRepoAmendToConfirmed` (the `expectedVersion === 0` rewrite) from `tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts`. No test adapter may repair an invalid production command.

### E4 — Original capture and PDF selection (Team 2 + Team 4)

`grinOriginalPicker` at `99ee60c` is images-only, `quality: 0.8`, URI-only, `claimedSha256: null`, missing size → 0.

Required:

- PDF/document selection (`application/pdf`) and supported image import (`image/jpeg|png|webp`) plus camera capture. Unsupported MIME fails explicitly.
- Copy selected bytes into a durable **app-owned** file **before** `attachOriginal`. A temporary picker URI is not offline retention.
- Hash and measure retained bytes with `hashBoundedChunks` / `HASH_CHUNK_BYTES`. Do not silently recompress a selected original and label it unchanged.
- Distinguish capture provenance: `camera_capture` | `imported_original` | `os_conversion` | `derivative`. Do **not** hardcode `osConversionOccurred: false` without evidence from the pinned `expo-image-picker` / document-picker behaviour. If conversion cannot be ruled out, label `os_conversion` (or unknown) and do not claim byte identity with the OS source.
- Verify `quality` / editing behaviour against pinned Expo 54 (`expo-image-picker ~17.0.11`). `quality: 1` alone does not prove identity.
- Origin-bound picker/copy/hash: retired callbacks must not attach to a new account. Dispose uncommitted temporary copies after retirement/cancellation; never delete queued or retained originals.
- No filenames, document bodies, or hashes in logs/telemetry.

Proof (label SQLITE_HOST / host filesystem; NATIVE_DEVICE not claimed): PDF import, supported image import, camera capture (injected camera bytes), cancellation, denied permission, missing/inaccurate picker size, oversize, changed bytes, temporary source disappearance, sqlite reopen, account switch while picker/copy/hash awaits.

Coordinator owns adding `expo-document-picker` to `package.json` when Team 4 proposes the exact SDK 54 version.

### E5 — Pack coverage reachable and precise (Team 2 + Team 4)

Extend upload categories so the app, outbox, server validation, sqlite descriptors, and support policy v2 share the same declared set: existing Wave 1 originals **plus** `stock_accounting`, `payment`, `gst`, `return_document`. Category remains a declared assertion, not live GSTR-2B / payment / supplier-status verification.

Do not weaken policy v2. Invoice reference ≠ retained commercial original. ITC always `not_determined`. Do not relabel a missing integration as `not_applicable` to produce a green badge.

Pack export must distinguish:

- **coverage** (inventory evaluation at a pinned cut) from
- **bundled artifacts** (whether original bytes are included in the export payload).

If the export is a manifest + PDF summary, label it as such; do not claim originals are bundled when they are not. When integrity is claimed, retrieve the pinned objects and verify stored/retrieved bytes against the retained actual hash.

Replace boolean complete/incomplete success checks with explicit cases:

- A. Required evidence absent → incomplete with **specific** `incompleteReasons`.
- B. All required policy items genuinely supplied through repository/transport → `mayMarkComplete` true without forcing completeness.
- C. Corrupt, missing, wrong-owner, wrong-receipt, wrong-generation, unavailable artifact → incomplete or error as appropriate.
- D. Later receipt events do not rewrite an earlier pinned export.

Team 4 must mount **actual** EWB, attachment/picker, and pack/share admitted bodies in origin.bind tests (inert native surfaces), including retirement before dispatch and after each relevant await. Do not claim cancellation of an OS share already launched; prevent new retired actions and publication of retired results.

## Unresolved product / policy choices (do not invent)

- GRIN pricing / ordinary-record quota — **owner decision pending**. Options (not selected): (A) GRIN counts against ordinary-record quota; (B) separate GRIN quota; (C) GRIN unused while default-off. Do not implement a silent bypass of account-deletion or quota.
- Retention/deletion of GRIN + Storage objects after account deletion — **owner decision pending**. Options (not selected): (A) delete with account; (B) retain for a legal-hold window; (C) export-then-delete. Deletion jobs must not be altered in this programme.
- Production admission flag, server admission, client visibility, deploy order (activation design later; not enabled here).
- Encrypted PDF backup (backlog).
- Live EWB / GSTR-2B / supplier-status integrations (manual assertions + `unknown` only).
