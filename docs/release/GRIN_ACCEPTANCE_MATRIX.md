# GRIN acceptance matrix — Wave 1

Team 5 owned. Contract revision `2026-10-01.wave1` (`GRIN_CONTRACT_REVISION` in `src/goodsEvidence/ports.ts`).
Ancestry on this branch: HEAD of `docs/release/GRIN_INTERFACE_CONTRACT.md` plus G1 parent `c9623dd`. Other teams are still coding G1 mutations / G2–G5.

**This matrix is not G6 completion.** Native device and Play-installed rows are `device_pending` / `play_pending` only. Those tests have not occurred. Billing, public release, Internal Testing, EAS, and live backends are out of scope for this programme.

Team 5 does **not** approve G1–G5 implementations. Presence of a path is an observation, not acceptance. Another agent reviewing this work is an extra review layer, not external certification or human sign-off.

`npx --yes tsx tools/grin-acceptance/runIds.ts` passing means **matrix IDs exist**. It is **not** CS-01…CS-11 workflow evidence and must not be reported as a combined-scenario pass.

Wave 2 ER-4/ER-5 executions (when present) live in `tools/grin-acceptance/startup/**` and `tools/grin-acceptance/workflows/**`, mapped in `docs/release/proposals/team5/WAVE2_ER45.md`. PHASE 2 independent review of landed W2-01…W2-05 is `docs/release/proposals/team5/WAVE2_PHASE2_REVIEW.md`. Independent F1–F4 production-path review on combined `7623eef` is `docs/release/proposals/team5/WAVE2APP_F5_REVIEW.md`. Those greens still use statuses below (`path_present_unapproved` / `tbd` / `device_pending`). They are not G6, not production admission, and not a row status of `complete` / `accepted` / `pass` / `done` / `approved`.

## Evidence labels

Use only:

| Label | Meaning |
|---|---|
| `PURE_DOMAIN` | In-process domain functions with no I/O |
| `INJECTED_PORT` | Domain or adapter with injected clock/hasher/store; not a live backend |
| `SQLITE_HOST` | Host SQLite or the in-memory SQL stand-in (`src/localDb/memorySqlite.ts`). Not native process-death proof |
| `FIRESTORE_EMULATOR` | Isolated Firestore emulator (G1 historical port 8088; Team 1 planned 8090). Never production |
| `STORAGE_EMULATOR` | Isolated Storage emulator (Team 2 planned 9200). Never production |
| `MOUNTED_REACT_INERT_NATIVE` | React tree / inert native module mocks. Not a physical device |
| `NATIVE_DEVICE` | Physical or authorized development-build device. **Pending only in Wave 1** |
| `PLAY_INSTALLED` | Play-installed Internal Testing / production binary. **Pending only in Wave 1** |

Multiple labels on one row are joined with `+` (all required before that row can later pass).

## Status values

| Status | Meaning |
|---|---|
| `tbd` | Implementation path not present on this ancestry |
| `path_present_unapproved` | Code exists; Team 5 has not accepted it |
| `wave1_scaffold` | Team 5 artefact only |
| `device_pending` | Native device test has not occurred |
| `play_pending` | Play-installed test has not occurred |
| `unresolved_policy` | Owner/product choice not made; do not invent |

Forbidden in this document: `complete`, `accepted`, `pass`, `done`, `approved` as a row status.

## High-priority combined scenarios (index)

Every scenario below has a six-column `CS-*` row later in this file. `NATIVE_DEVICE` / `PLAY_INSTALLED` appear only on pending rows.

- CS-01 — Offline receipt → restart → reconnect → exactly one issued GRIN
- CS-02 — Upload completes but response/link fails → safe recovery
- CS-03 — Account change during save/upload/export → no cross-account publication
- CS-04 — Two concurrent registrations → unique scoped serials
- CS-05 — Two amendments against one version → controlled conflict
- CS-06 — Partial rejection/return → conserved quantities and preserved original
- CS-07 — Missing/replaced/tampered evidence → incomplete or rejected pack
- CS-08 — EWB cancellation → retained facts without fabricated movement
- CS-09 — Missing 2B/supplier data → unknown, not automatic compliance clearance
- CS-10 — Failure after commit → replay of original result
- CS-11 — Existing diary/PO/credit/pack/letterhead behavior remains intact

---

## G1 — Durable server register/reconcile

Owner programme: server-authoritative serial + IST FY; immutable issued snapshot; auth/ledger/admission; replay / digest_conflict / receipt_exists; isolated emulator Rules. Not live. Not production admission.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G1-R01 | G1 | commandId is owner+ledger+commandId, charset `[A-Za-z0-9_-]{8,128}`, digest identity | `src/goodsEvidence/command.ts`; `tools/goods-evidence-emulator/ids.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R02 | G1 | receiptId identity; `receipt_exists` cannot be bypassed with a new commandId | `tools/goods-evidence-emulator/adapter.ts`; `src/goodsEvidence/ledger.ts` | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R03 | G1 | ledgerId charset; authenticated uid wins over envelope `ownerUid` | `tools/goods-evidence-emulator/adapter.ts`; `tools/goods-evidence-emulator/ids.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R04 | G1 | IDs are never rewritten; lineId admits ordinary ids including `toString`; rejects `__proto__` / `constructor` / `prototype` | `src/goodsEvidence/validate.ts`; `tools/goods-evidence-emulator/ids.ts`; `tools/goods-evidence-emulator/adapter.ts` | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R05 | G1 | eventId is a server UUID, not a client field | `tools/goods-evidence-emulator/adapter.ts` (`clock.uuid`) | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R06 | G1 | Trusted identity is the authenticated Firebase uid, not the body | `tools/goods-evidence-emulator/types.ts` `TrustedCaller`; `adapter.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R07 | G1 | Check order: unauthenticated → user doc / pending_deletion / inactive → ledger owner+active → admission config → command validation | `tools/goods-evidence-emulator/adapter.ts` `gate` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R08 | G1 | Missing uid returns `unauthenticated` | `tools/goods-evidence-emulator/adapter.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R09 | G1 | Missing/inactive user, pending_deletion, foreign or retired ledger returns `forbidden` with generic deny and no existence leak | `tools/goods-evidence-emulator/adapter.ts`; `tools/goods-evidence-emulator/ARCHITECTURE.md` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R10 | G1 | Missing/malformed or gated admission returns `policy_denied`; denied reconcile does not reveal whether the command exists | `tools/goods-evidence-emulator/adapter.ts`; `ARCHITECTURE.md` admission matrix | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R11 | G1 | Authorized reconcile of a missing command returns `not_found` only after owner/ledger/admission allow reconciliation | `tools/goods-evidence-emulator/adapter.ts` `reconcile` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R12 | G1 | No pending-deletion replay exception | `tools/goods-evidence-emulator/adapter.ts` `gate`; `src/goodsEvidence/ports.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R13 | G1 | Do not silently change existing auth or account-deletion policy; GRIN records stay owner-scoped under `users/{uid}/…` | `tools/goods-evidence-emulator/paths.ts`; production deletion jobs untouched | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R14 | G1 | Retention/deletion of GRIN after `pending_deletion` / `retireIdentity` is unresolved; deletion jobs must not be altered in this programme | docs/register only | PURE_DOMAIN | unresolved_policy |
| G1-R15 | G1 | Server registration time sampled per transaction attempt; test clocks are not live commit time; `firestoreCommitTime` stays null and is excluded from hashes | `tools/goods-evidence-emulator/adapter.ts`; `src/goodsEvidence/canonical.ts` `CANONICAL_EXCLUSIONS` | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R16 | G1 | IST FY and serials use the server instant, not reported arrival; crossing FY on retry reallocates against the new FY counter | `src/goodsEvidence/time.ts`; `src/goodsEvidence/grinNumber.ts`; `tools/goods-evidence-emulator/serial.ts` | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R17 | G1 | Replay of a stored matching digest returns the original result with `replayed: true` and zero writes | `tools/goods-evidence-emulator/adapter.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R18 | G1 | `digest_conflict` when same commandId, different digest, while submit is allowed | `tools/goods-evidence-emulator/adapter.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R19 | G1 | `receipt_exists` when the receipt is already issued under another command | `tools/goods-evidence-emulator/adapter.ts`; `src/goodsEvidence/ledger.ts` | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R20 | G1 | Client-supplied server fields (`issuedNumber`, serial, hashes, `firestoreCommitTime`, …) are rejected | `tools/goods-evidence-emulator/limits.ts` `serverFieldError` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R21 | G1 | Logging uses fixed event names and bounded metadata only; `grin_g1_committed` emits once after `runTransaction` resolves, never on abort or replay | `tools/goods-evidence-emulator/log.ts`; `adapter.ts` `runAttempts` | FIRESTORE_EMULATOR+INJECTED_PORT | path_present_unapproved |
| G1-R22 | G1 | Retry only gRPC/Firestore ABORTED (`10` / `ABORTED` / `aborted`); message text is not a retry classifier | `tools/goods-evidence-emulator/retry.ts` | INJECTED_PORT | path_present_unapproved |
| G1-R23 | G1 | Canonical JSON: schema v1, sorted keys, explicit nulls, omit undefined object properties, reject undefined/sparse array entries, reject prototype keys, reject non-plain objects | `src/goodsEvidence/canonical.ts`; `src/goodsEvidence/constants.ts` | PURE_DOMAIN | path_present_unapproved |
| G1-R24 | G1 | Undefined-object contract: `{ optional: undefined }` equals omitting `optional`; adapter must normalize a copy before digest/validation/persistence; required fields still fail if absent; array holes stay `invalid`; db/clock/UUID/commit failures are not `invalid` | `src/goodsEvidence/canonical.ts` omits at canonicalize; adapter pre-validation normalize TBD (Team 1 Wave 1) | INJECTED_PORT | tbd |
| G1-R25 | G1 | Register issues an immutable `original` snapshot, first `receipt_registered` event, command result, serial, and projections | `tools/goods-evidence-emulator/adapter.ts` `buildIssued` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R26 | G1 | Later commands append events and update `view` / line ledgers / `effective`; they never overwrite `original` | `src/goodsEvidence/ledger.ts` (simulated); durable mutation adapter TBD | PURE_DOMAIN | path_present_unapproved |
| G1-R27 | G1 | Admission matrix for newCommands / reconciliation matches G1 `ARCHITECTURE.md`; mutations must use `newCommands` the same way once packaged | `tools/goods-evidence-emulator/ARCHITECTURE.md`; `adapter.ts` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R28 | G1 | Malformed existing FY counters return `integrity` (zero writes, no repair); exhaustion returns `serial_exhausted`; no serial reuse | `tools/goods-evidence-emulator/serial.ts` | FIRESTORE_EMULATOR+INJECTED_PORT | path_present_unapproved |
| G1-R29 | G1 | Per-owner admission reads are not a global write lock; serial allocation contends on `…/serials/{fyToken}` per owner+ledger+FY | `tools/goods-evidence-emulator/adapter.ts`; `ARCHITECTURE.md` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R30 | G1 | Production `functions/src/index.ts` keeps `lib/index.js` as entrypoint; `functions/src` must not import Expo client runtime; shared domain is a generated copy; G1 emulator stays under `tools/goods-evidence-emulator/**` until packaging lands | `functions/src/index.ts`; `functions/tsconfig.json`; `functions/src/goodsEvidence/**` TBD | PURE_DOMAIN | tbd |
| G1-R31 | G1 | GRIN stays default-off (`isGoodsEvidenceEnabled` + store-runtime block). Do not enable production admission to demonstrate the feature | `src/goodsEvidence/featureFlag.ts`; `app.json` / `eas.json` have no GOODS_EVIDENCE flag | PURE_DOMAIN | path_present_unapproved |
| G1-R32 | G1 | Isolated emulator Rules are not deployed; client writes to GRIN collections are denied in the emulator Rules file | `tools/goods-evidence-emulator/firestore.rules`; production `firestore.rules` has no goodsEvidence matchers | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R33 | G1 | Issued snapshot carries buyer, supplier (assertion not live GST status), commercial links, lines (HSN, quantities, condition, line QC), custody, warehouse/bin, attributed receiving/QC text, acknowledgement, capture provenance, client captured-at, reported arrival+TZ | `src/goodsEvidence/types.ts` `ImmutableGrin`; `src/goodsEvidence/validate.ts`; emulator snapshot write | FIRESTORE_EMULATOR+PURE_DOMAIN | path_present_unapproved |
| G1-R34 | G1 | EWB on register is stored as submitted observation (`none` or recorded); not statutory applicability or live portal verification | `src/goodsEvidence/ewb.ts` `EwbLink`; register body | PURE_DOMAIN | path_present_unapproved |
| G1-R35 | G1 | Independent reconcile({ ledgerId, commandId }) recovers lost responses without a second serial | `tools/goods-evidence-emulator/adapter.ts` `reconcile` | FIRESTORE_EMULATOR | path_present_unapproved |
| G1-R36 | G1 | G1 callable surface is register + reconcile only; amend/QC/return/EWB-mutation/evidence/SQLite/PDF are not G1 | `tools/goods-evidence-emulator/ARCHITECTURE.md`; adapter rejects non-register types | FIRESTORE_EMULATOR | path_present_unapproved |

---

## G2 — Protected original evidence upload

Owner programme: untrusted upload rejected until auth/ownership/active ledger; original bytes off-client; server hash at generation; link is event+pointer; no PDF bodies in logs. Live IAM/Storage authorization is out of this programme.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G2-R01 | G2 | Untrusted upload rejected until auth, ownership, and active ledger pass | TBD `tools/goods-evidence-storage/**`; ports `EvidenceIdentity` | STORAGE_EMULATOR+FIRESTORE_EMULATOR | tbd |
| G2-R02 | G2 | Original bytes stored off-client under owner-scoped paths; object storage paths use a separate random object key, never business fields | TBD; `docs/release/GRIN_INTERFACE_CONTRACT.md` Identifiers | STORAGE_EMULATOR | tbd |
| G2-R03 | G2 | Client hash is a claim; verification hashes stored bytes at the exact generation | `src/goodsEvidence/evidence.ts` `verifyOriginalBytes` is an injected hasher (not the Storage worker); generation-aware worker TBD | INJECTED_PORT | tbd |
| G2-R04 | G2 | `EvidenceObjectState` transitions match `EVIDENCE_STATE_TRANSITIONS` in ports.ts | `src/goodsEvidence/ports.ts` (types only); lifecycle engine TBD | INJECTED_PORT | tbd |
| G2-R05 | G2 | Original bytes are distinct from thumbnails/OCR/previews; derivatives cannot claim a missing original is retained | `src/goodsEvidence/evidence.ts` `derivativesMustNotReplaceOriginal` | PURE_DOMAIN | path_present_unapproved |
| G2-R06 | G2 | Replacement after verification needs a new object id; it must not inherit the old verified result | TBD (ports comment); `EvidenceObjectState` `rejected` is terminal per object id | STORAGE_EMULATOR | tbd |
| G2-R07 | G2 | No cross-user dedup that leaks existence | TBD | STORAGE_EMULATOR+FIRESTORE_EMULATOR | tbd |
| G2-R08 | G2 | No public bucket | TBD; live `storage.rules` has no GRIN matchers (proposal-only path for Team 2) | STORAGE_EMULATOR | tbd |
| G2-R09 | G2 | No business details in object paths | TBD | STORAGE_EMULATOR | tbd |
| G2-R10 | G2 | This is not encrypted-backup (backlog) | backlog; do not implement here | PURE_DOMAIN | unresolved_policy |
| G2-R11 | G2 | `linkVerifiedEvidence` accepts only Team 2 `VerifiedEvidenceResult` (actual hash/size/generation) | `src/goodsEvidence/ports.ts` type only; command body TBD (not in `command.ts`) | INJECTED_PORT | tbd |
| G2-R12 | G2 | Link is an event + pointer, never a rewrite of `original` | TBD event append; `src/goodsEvidence/types.ts` `evidence_verified` | FIRESTORE_EMULATOR | tbd |
| G2-R13 | G2 | Unauthenticated, cross-owner, and pending-deletion requests denied | TBD | STORAGE_EMULATOR+FIRESTORE_EMULATOR | tbd |
| G2-R14 | G2 | No PDF bodies, raw business documents, or PII in logs | TBD G2 logger; G1 `log.ts` allowlist is the pattern | INJECTED_PORT | tbd |
| G2-R15 | G2 | `evidence_registered` / `evidence_verified` events exist on the stream when linkage succeeds | `src/goodsEvidence/types.ts` event names; producers TBD | FIRESTORE_EMULATOR | tbd |
| G2-R16 | G2 | Upload-completes-but-response-or-link-fails recovers without a second object claiming the same verified generation (see CS-02) | TBD `orphan_pending_review` transition | STORAGE_EMULATOR+FIRESTORE_EMULATOR | tbd |

---

## G3 — Durable SQLite outbox

Owner programme: durable device queue; interrupted register recovers via G1 replay/reconcile without a second serial; rows bound to signed-in owner; no locally invented issued numbers. Host SQLite is not native death proof.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G3-R01 | G3 | Outbox states are exactly `OutboxLocalState` | `src/goodsEvidence/ports.ts`; host implementation TBD `src/services/grin/outbox/**` | SQLITE_HOST | tbd |
| G3-R02 | G3 | Local records never invent `issuedNumber` or `serverRegisteredAtUtc` | `src/goodsEvidence/ports.ts` `LocalReceiptRecord`; `src/goodsEvidence/offline.ts` simulation sets both null | PURE_DOMAIN | path_present_unapproved |
| G3-R03 | G3 | Queued digest is frozen; edits cannot silently mutate a command already sent | TBD outbox; domain `assertFrozenUnchanged` in `command.ts` | SQLITE_HOST+PURE_DOMAIN | tbd |
| G3-R04 | G3 | Ambiguous network → reconcile/replay, not a second register | TBD worker + G1 `reconcile` | SQLITE_HOST+FIRESTORE_EMULATOR | tbd |
| G3-R05 | G3 | Account switch: no dispatch or display of another owner's work | TBD | SQLITE_HOST+MOUNTED_REACT_INERT_NATIVE | tbd |
| G3-R06 | G3 | Generation changes (A → logout → A) must not reuse the other generation's in-flight worker | `LocalReceiptRecord.dispatchGeneration`; worker TBD | SQLITE_HOST | tbd |
| G3-R07 | G3 | Account retirement does not silently delete unsynchronised local evidence | TBD; unresolved vs server deletion policy (G1-R14) | SQLITE_HOST | tbd |
| G3-R08 | G3 | Host SQLite tests are not native process-death proof | `src/localDb/memorySqlite.ts` notice; DEV-01 pending | SQLITE_HOST | path_present_unapproved |
| G3-R09 | G3 | Durable device queue survives process death | TBD; native proof is DEV-01 only | NATIVE_DEVICE | device_pending |
| G3-R10 | G3 | Interrupted register recovers via G1 replay/reconcile without a second serial (see CS-01, CS-10) | TBD + `tools/goods-evidence-emulator/adapter.ts` | SQLITE_HOST+FIRESTORE_EMULATOR | tbd |
| G3-R11 | G3 | Queue rows are bound to the signed-in owner/account | TBD | SQLITE_HOST | tbd |
| G3-R12 | G3 | `offline.ts` remains a labelled in-process fixture; the real outbox is not that file | `src/goodsEvidence/offline.ts` | PURE_DOMAIN | path_present_unapproved |
| G3-R13 | G3 | SQLite v10 GRIN tables via `src/localDb/migrateGrin.ts`; `DB_VERSION` is currently 9 | `src/localDb/schema.ts`; `migrateGrin.ts` TBD | SQLITE_HOST | tbd |

---

## G4 — Receiving / inspection / amendment / EWB / return

Owner programme: screens plus durable adapters with the same auth/ledger gates; issued numbers immutable; EWB observation only; supplier-status / GSTR-2B remain assertions.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G4-R01 | G4 | Screens for receiving, inspection, amendment, EWB observation, return/rejection | TBD `app/(app)/grin/**` | MOUNTED_REACT_INERT_NATIVE | tbd |
| G4-R02 | G4 | Durable adapters for those commands with the same auth/ledger gates as register | TBD `functions/src/goodsEvidence/**`; simulated `src/goodsEvidence/ledger.ts` | FIRESTORE_EMULATOR | tbd |
| G4-R03 | G4 | Issued numbers remain immutable across mutations | `src/goodsEvidence/ledger.ts`; emulator register snapshot | PURE_DOMAIN | path_present_unapproved |
| G4-R04 | G4 | EWB is recorded observation only; not a live portal | `src/goodsEvidence/ewb.ts` | PURE_DOMAIN | path_present_unapproved |
| G4-R05 | G4 | Supplier-status / GSTR-2B fields stay user assertions unless a later verified connector exists | `src/goodsEvidence/exceptions.ts`; live connectors unresolved | PURE_DOMAIN | unresolved_policy |
| G4-R06 | G4 | `amendFields` requires `expectedVersion` and does not rewrite `original` | `src/goodsEvidence/command.ts`; `ledger.ts`; `validate.ts` `AMENDABLE_GRIN_FIELDS` | PURE_DOMAIN | path_present_unapproved |
| G4-R07 | G4 | Two amendments against one version return `version_conflict` (see CS-05) | `src/goodsEvidence/ledger.ts` `prepareMutation` | PURE_DOMAIN | path_present_unapproved |
| G4-R08 | G4 | `recordQc` / reclassify append events; original custody on the issued snapshot is preserved | `src/goodsEvidence/ledger.ts`; `src/goodsEvidence/custody.ts` | PURE_DOMAIN | path_present_unapproved |
| G4-R09 | G4 | `dispatchReturn` conserves quantities; original physical-received is not rewritten (see CS-06) | `src/goodsEvidence/quantities.ts` `applyReturnDispatch` | PURE_DOMAIN | path_present_unapproved |
| G4-R10 | G4 | `correctReturnDispatch` requires a linked event and must not exceed dispatchedReturn | `src/goodsEvidence/quantities.ts` `applyReturnCorrection`; `ledger.ts` | PURE_DOMAIN | path_present_unapproved |
| G4-R11 | G4 | `voidWithReason` preserves the issued number | `src/goodsEvidence/ledger.ts` | PURE_DOMAIN | path_present_unapproved |
| G4-R12 | G4 | `recordEwbObservation` records portal/movement/QC histories independently | `src/goodsEvidence/ewb.ts`; command type in ports, body TBD in `command.ts` | PURE_DOMAIN | tbd |
| G4-R13 | G4 | Delivery does not cancel an EWB | `src/goodsEvidence/ewb.ts` `recordArrival` | PURE_DOMAIN | path_present_unapproved |
| G4-R14 | G4 | Cancellation evidence retains reason, `goodsMoved` (unknown stays unknown), linked document, party, amount, replacement | `src/goodsEvidence/ewb.ts` `cancellationEvidenceError` / `recordPortalCancellation` | PURE_DOMAIN | path_present_unapproved |
| G4-R15 | G4 | Mutations require trusted identity, scoped idempotency (`commandId`+digest), `expectedVersion`, atomic event+projection+command-result | simulated in `ledger.ts`; durable adapter TBD | FIRESTORE_EMULATOR | tbd |
| G4-R16 | G4 | Mutations use `newCommands` the same way as register (matching digest replay when submit allowed; no replay when submit denied) | TBD durable adapter; G1 admission matrix | FIRESTORE_EMULATOR | tbd |
| G4-R17 | G4 | Lost mutation responses recover via stored command result (replay) or reconcile | TBD; G1 `storedSuccess` currently understands register results only — contract gap | FIRESTORE_EMULATOR | tbd |
| G4-R18 | G4 | Mutation results match `GrinMutationResult` (`eventId`, `eventVersion`, `headHash`, `serverAcceptedAtUtc`, `replayed`) | `src/goodsEvidence/ports.ts`; ledger returns a narrower simulated shape | INJECTED_PORT | tbd |
| G4-R19 | G4 | `version_conflict` on stream mismatch; `voided` against a voided receipt | `src/goodsEvidence/ports.ts`; `ledger.ts` | PURE_DOMAIN | path_present_unapproved |
| G4-R20 | G4 | Findings never grant or deny ITC; `itcDisposition` remains `not_determined` | `src/goodsEvidence/exceptions.ts`; `src/goodsEvidence/constants.ts` footer | PURE_DOMAIN | path_present_unapproved |
| G4-R21 | G4 | Remaining exception rule ids (`supplier_later_suspended_or_cancelled`, `grin_or_invoice_missing_from_2b`, …) are evaluators or explicit TBD, not silent clearance | `src/goodsEvidence/exceptions.ts` types; only `gstr2bPurchaseWithoutGrin` and `grinWithoutInvoice` implemented | PURE_DOMAIN | tbd |

---

## G5 — Versioned evidence-pack / PDF export

Owner programme: versioned pack bytes; explicit completeness explanations; footer remains not a GST document / not ITC determination; no silent backfill.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G5-R01 | G5 | `assembleManifest` / `evaluatePackCompleteness` use support policy v2 | `src/goodsEvidence/evidencePack.ts`; `src/goodsEvidence/evidenceSupport.ts` | PURE_DOMAIN | path_present_unapproved |
| G5-R02 | G5 | Pin event cuts and evidence generations | `src/goodsEvidence/evidencePack.ts` `pinEventCut` / `PackVerificationAnchors` | PURE_DOMAIN | path_present_unapproved |
| G5-R03 | G5 | Missing or corrupt original → incomplete; never label incomplete as complete | `evaluatePackCompleteness`; `mayMarkComplete` | PURE_DOMAIN | path_present_unapproved |
| G5-R04 | G5 | Invoice reference is not a retained invoice; challan is not an invoice; `commercial_document` cannot be satisfied from snapshot fields | `src/goodsEvidence/evidenceSupport.ts` policy v2 | PURE_DOMAIN | path_present_unapproved |
| G5-R05 | G5 | ITC remains `not_determined` on every assembled manifest | `assembleManifest` hard-codes `itcDisposition: "not_determined"` | PURE_DOMAIN | path_present_unapproved |
| G5-R06 | G5 | Versioned pack bytes / PDF export pipeline | TBD `src/services/grin/pdf/**`; completeness model only today | MOUNTED_REACT_INERT_NATIVE | tbd |
| G5-R07 | G5 | Explicit completeness explanations for missing originals / EWB / QC | `incompleteReasons` + `inventoryEvaluation` | PURE_DOMAIN | path_present_unapproved |
| G5-R08 | G5 | Footer remains internal goods receipt evidence — not a GST document or ITC determination | `src/goodsEvidence/constants.ts` `GRIN_DOCUMENT_FOOTER` | PURE_DOMAIN | path_present_unapproved |
| G5-R09 | G5 | No silent backfill of missing evidence | `evaluatePackCompleteness` unresolved items stay incomplete | PURE_DOMAIN | path_present_unapproved |
| G5-R10 | G5 | Missing, replaced, or tampered evidence → incomplete or rejected pack (see CS-07) | `evidence.pack.test.ts` (domain); Storage generation mismatch TBD | PURE_DOMAIN+STORAGE_EMULATOR | tbd |
| G5-R11 | G5 | Missing 2B / supplier data → `unknown` / `unknown_incomplete_source`, not automatic compliance clearance (see CS-09) | `src/goodsEvidence/exceptions.ts` `gstr2bPurchaseWithoutGrin` | PURE_DOMAIN | path_present_unapproved |

---

## G6 — Combined device, accessibility, security, operational acceptance

Must not be marked complete from source or emulator tests. Device/Play rows below are pending.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| G6-R01 | G6 | Play-installed binary exercised for GRIN journeys | TBD after separate Internal Testing authorization | PLAY_INSTALLED | play_pending |
| G6-R02 | G6 | TalkBack on GRIN screens | TBD screens; `docs/release/GRIN_DEVICE_CHECKLIST.md` | NATIVE_DEVICE | device_pending |
| G6-R03 | G6 | Account switch and pending-deletion on device | TBD + existing auth policy (must not be silently changed) | NATIVE_DEVICE | device_pending |
| G6-R04 | G6 | Safe diagnostics: allowlisted events only; no raw business documents / PII / secrets | `tools/goods-evidence-emulator/log.ts` pattern; G2–G5 loggers TBD | INJECTED_PORT | tbd |
| G6-R05 | G6 | Operational runbook for emulator vs live, admission flags, and incident replay | TBD; not this Wave 1 scaffold | PURE_DOMAIN | tbd |
| G6-R06 | G6 | Must not mark G6 / device / billing / public release complete from source or emulator tests | this matrix; `docs/release/GRIN_TEAM_BOARD.md` readiness table | PURE_DOMAIN | wave1_scaffold |
| G6-R07 | G6 | Store/standalone runtimes keep GRIN admission off even if the public env is `1` | `src/goodsEvidence/featureFlag.ts` | PURE_DOMAIN | path_present_unapproved |
| G6-R08 | G6 | Combined source review of G1–G5 diffs is a later gate; Wave 1 does not start it | coordinator board: COMBINED SOURCE REVIEW `not started` | PURE_DOMAIN | wave1_scaffold |

---

## Combined scenarios

Host/emulator labels may be used for later Wave 2 fills. `NATIVE_DEVICE` and `PLAY_INSTALLED` stay on the pending DEV/PLAY rows only.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| CS-01 | G3+G1 | Offline receipt → restart → reconnect → exactly one issued GRIN | `tools/grin-interop/cs01-offline-restart-register.sqliteHost.test.ts` via `npm run test:grin-interop` (Team 3; not duplicated). Host reopen is not NATIVE_DEVICE (DEV-01 still `device_pending`). `runIds.ts` CS-01 stub is **not** this evidence. | SQLITE_HOST+INJECTED_PORT | path_present_unapproved |
| CS-02 | G2+G1 | Upload completes but response/link fails → safe recovery (no silent second verified object; `orphan_pending_review` or equivalent) | `tools/grin-acceptance/workflows/cs02-upload-link.injected.test.ts` via Team 2 `createInjectedGrinEvidencePort` + existing `npm run test:goods-evidence-g2-unit` (adapter not copied). G1 link not executed. STORAGE_EMULATOR only if hosts already set | INJECTED_PORT+STORAGE_EMULATOR+FIRESTORE_EMULATOR | path_present_unapproved |
| CS-03 | G2+G3+G4+G5 | Account change during save/upload/export → no cross-account publication | `tools/grin-acceptance/workflows/cs03-account-change.sqliteHost.test.ts` (outbox owner isolation only); Storage/export/UI not executed | SQLITE_HOST+STORAGE_EMULATOR+FIRESTORE_EMULATOR+MOUNTED_REACT_INERT_NATIVE | path_present_unapproved |
| CS-04 | G1 | Two concurrent registrations → unique scoped serials (distinct receipts share owner+ledger+FY counter without duplicate serials; identical commandId collapses to one issue + replay) | `tools/grin-acceptance/workflows/cs04-concurrent-serials.injected.test.ts`; emulator file needs `FIRESTORE_EMULATOR_HOST` | INJECTED_PORT+FIRESTORE_EMULATOR | path_present_unapproved |
| CS-05 | G4 | Two amendments against one version → controlled `version_conflict`; matching digest replay remains zero extra events | `tools/grin-acceptance/workflows/cs05-amendment-conflict.injected.test.ts` (durable G1 adapter) | INJECTED_PORT | path_present_unapproved |
| CS-06 | G4 | Partial rejection/return → conserved quantities and preserved original physical-received / original custody | `tools/grin-acceptance/workflows/cs06-partial-return.injected.test.ts` | INJECTED_PORT | path_present_unapproved |
| CS-07 | G2+G5 | Missing/replaced/tampered evidence → incomplete or rejected pack; derivatives cannot complete a missing original | `tools/grin-acceptance/workflows/cs07-tampered-evidence-pack.test.ts`; STORAGE_EMULATOR generation mismatch not executed here | PURE_DOMAIN+INJECTED_PORT+STORAGE_EMULATOR | path_present_unapproved |
| CS-08 | G4 | EWB cancellation → retained facts without fabricated movement; delivery does not cancel EWB; unknown `goodsMoved` stays unknown | `tools/grin-acceptance/workflows/cs08-ewb-cancellation.test.ts` (no live GST/EWB portal) | PURE_DOMAIN | path_present_unapproved |
| CS-09 | G4+G5 | Missing 2B/supplier data → unknown / `unknown_incomplete_source`, not automatic compliance clearance; ITC stays `not_determined` | `tools/grin-acceptance/workflows/cs09-missing-2b-supplier.test.ts` (no live GST portal) | PURE_DOMAIN | path_present_unapproved |
| CS-10 | G1+G3 | Failure after commit → replay of the original result (`replayed: true`, zero writes, same issued number) | `tools/grin-acceptance/workflows/cs10-replay-after-commit.injected.test.ts`; Functions unexported; outbox lost-response not this file | INJECTED_PORT+FIRESTORE_EMULATOR | path_present_unapproved |
| CS-11 | core | Existing diary / PO / credit / pack / letterhead behavior remains intact (see REG-*) | `tools/grin-acceptance/workflows/cs11-existing-product.test.ts` isolation only; REG-* / MOUNTED not re-run; diary row also ER-4 SQLITE_HOST | PURE_DOMAIN+MOUNTED_REACT_INERT_NATIVE | path_present_unapproved |

---

## Security

Authorization is not “hide the button”. Rules tests and Admin-SDK adapter tests are separate. Emulator tests must not relax live Rules or fall back to production.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| SEC-01 | G1-G5 | Authorization at backend entrypoints (callable/adapter/Rules), not only hidden UI | G1 adapter `gate`; G2–G5 callables TBD; client flag is not server admission | FIRESTORE_EMULATOR+STORAGE_EMULATOR | tbd |
| SEC-02 | G1-G2 | Rules vs Admin-SDK tested separately (Admin bypasses Rules; adapter still authorizes callers) | `tools/goods-evidence-emulator/rules.emulator.test.ts`; `firestore.rules` (emulator copy) | FIRESTORE_EMULATOR | path_present_unapproved |
| SEC-03 | G1-G5 | No client entitlement, serial, or audit authority (`issuedNumber` / serial / hashes / `firestoreCommitTime` rejected; serial on server FY doc) | `tools/goods-evidence-emulator/limits.ts`; `serial.ts`; UI TBD | FIRESTORE_EMULATOR+MOUNTED_REACT_INERT_NATIVE | tbd |
| SEC-04 | G1-G5 | No raw business documents, PII, or secrets in logs (fixed event names, bounded metadata) | `tools/goods-evidence-emulator/log.ts`; later mutation/G2 names TBD | INJECTED_PORT | path_present_unapproved |
| SEC-05 | G6 | Dependency and secret scanning of the changed GRIN scope with honest findings (not a clean-bill claim) | `docs/release/proposals/team5/SCOPE_SCAN_WAVE1.md` | PURE_DOMAIN | wave1_scaffold |
| SEC-06 | G1-G2 | No broad Rules relaxation; emulator tests must not fall back to production project/data | `tools/goods-evidence-emulator/firebase.json` project `demo-vyaamikk-grin-g1`; isolated Rules `allow write: if false` on GRIN paths | FIRESTORE_EMULATOR+STORAGE_EMULATOR | path_present_unapproved |
| SEC-07 | G1 | `functions/src` must not import Expo client runtime (`@/…`, React, localDb) | `tools/goods-evidence-emulator/isolation.contract.test.ts`; packaging TBD | PURE_DOMAIN | path_present_unapproved |
| SEC-08 | G1-G5 | Client cannot mint serials, rewrite command/receipt/evidence identities, or supply audit hashes | `ids.ts`; `limits.ts` `serverFieldError`; G2 random object key TBD | FIRESTORE_EMULATOR+STORAGE_EMULATOR | tbd |

---

## Existing product regression (CS-11 detail)

GRIN domain isolation forbids diary save locks, billing, PDF services, navigation, and SQLite migration inside `src/goodsEvidence` (except the default-off flag). Broader product suites remain the regression evidence; Wave 2 must re-run them after G1–G5 land.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| REG-01 | core | Diary save/sync/ownership behavior remains intact | `src/services/diary/*.test.ts`; `npm run test:diary-local-sync`; diary emulator tests in `test:firestore-rules` | PURE_DOMAIN+FIRESTORE_EMULATOR | path_present_unapproved |
| REG-02 | core | Purchase-order create/PDF/serial behavior remains intact | `src/domain/purchaseOrder.ts`; `src/services/pdf/purchaseOrderPdfService.ts`; `src/services/records/saveLifecycle.test.ts`; quota emulator PO cases | PURE_DOMAIN+FIRESTORE_EMULATOR | path_present_unapproved |
| REG-03 | core | Customer-credit save lifecycle remains intact | `src/domain/customerCredit.test.ts`; `src/services/customerCredit/saveLifecycle.test.ts` | PURE_DOMAIN | path_present_unapproved |
| REG-04 | core | Existing professional-pack / PDF pack behavior remains intact (not the GRIN evidence pack) | `src/services/pdf/*` pack suites already in `test:all`; GRIN pack is G5 and must not replace these | PURE_DOMAIN | path_present_unapproved |
| REG-05 | core | Letterhead PDF/quota/dispatch behavior remains intact | `npm run test:letterhead-pdf`; `test:letterhead-quota-lifecycle`; letterhead emulator tests | PURE_DOMAIN+FIRESTORE_EMULATOR | path_present_unapproved |

---

## Native device (pending only)

These rows exist so Wave 2 / authorized Internal Testing can attach evidence. Status is `device_pending`. Scripts: `tools/grin-acceptance/device/` and `docs/release/GRIN_DEVICE_CHECKLIST.md`.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| DEV-01 | G3+G6 | Process-death of a queued offline register still yields exactly one issued GRIN after reconnect | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-01 | NATIVE_DEVICE | device_pending |
| DEV-02 | G6 | TalkBack announces GRIN screens, required fields, and error states | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-02 | NATIVE_DEVICE | device_pending |
| DEV-03 | G6 | Account switch on device never shows or dispatches the other owner's GRIN/outbox/export | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-03 | NATIVE_DEVICE | device_pending |
| DEV-04 | G6 | Pending-deletion / inactive account cannot register, upload, or export GRIN | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-04 | NATIVE_DEVICE | device_pending |
| DEV-05 | G3+G6 | Airplane-mode capture, force-stop, reconnect | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-05 | NATIVE_DEVICE | device_pending |
| DEV-06 | G6 | Keyboard/focus order and contrast on GRIN forms | `docs/release/GRIN_DEVICE_CHECKLIST.md` DEV-06 | NATIVE_DEVICE | device_pending |

---

## Play-installed (pending only)

Not authorized in this programme. Rows are placeholders.

| ID | Slice | Requirement | Implementation path | Evidence labels | Status |
|---|---|---|---|---|---|
| PLAY-01 | G6 | Play-installed binary keeps GRIN default-off (store-runtime block) | `docs/release/GRIN_DEVICE_CHECKLIST.md` PLAY-01 | PLAY_INSTALLED | play_pending |
| PLAY-02 | G6 | Authorized Internal Testing GRIN journeys on a Play-installed build | not authorized | PLAY_INSTALLED | play_pending |

---

## Explicit non-approvals (Wave 1)

- G1 emulator register/reconcile at `c9623dd` is **not** accepted by Team 5 (see `docs/release/proposals/team5/G1_C9623DD_OBSERVATIONS.md`).
- G1–G5 production implementations are **not** accepted.
- G6 is **not** complete.
- Device, billing, and public release are **not** complete.
- `runIds.ts` greens mean “matrix IDs exist”, not “combined workflows pass”.
- Wave 2 is **not** accepted. G6 / device / billing / public release stay not Done.
