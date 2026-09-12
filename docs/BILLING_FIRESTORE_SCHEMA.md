# Vyaamikk Diary — Billing Firestore Schema Contract (Phase A)

Field-level contracts live as TypeScript types in
`functions/src/billing/types.ts` (single source of truth); this document
fixes paths, writers, readers and Rules behavior. Firestore is
schema-by-use: **no documents are pre-created to "initialize" collections.**

## Paths, writers, readers

| Path | Writer | Client read | Client write |
| --- | --- | --- | --- |
| `users/{uid}/subscription/status` | Admin SDK only | owner | denied (all ops) |
| `users/{uid}/subscription/usageCurrent` | Admin SDK + the single Option-C atomic transition | owner | ONLY the gated atomic quota transition; delete denied |
| `users/{uid}/subscriptionBillingHistory/{eventId}` | Admin SDK only (sanitized events) | owner | denied |
| `users/{uid}/subscription/billingDetails` | Admin SDK only (`updateBillingDetails` / `verifyGstinManual`) | owner | denied |
| `users/{uid}/preferences/billingUx` | client (owner) | owner | `hasOnly(benefitScreenShownAt, updatedAt)`, ints; delete denied |
| `_companyBilling/{uid}` | Admin SDK only | denied (even own uid) | denied |
| `_subscriptionInvoices/{invoiceId}` | Admin SDK only | denied | denied |
| `_subscriptionCreditNotes/{creditNoteId}` | Admin SDK only | denied | denied |
| `_invoiceCounters/{financialYear}` | Admin SDK only | denied | denied |
| `_creditNoteCounters/{financialYear}` | Admin SDK only | denied | denied |
| `_invoiceRetryQueue/{invoiceId}` | Admin SDK only | denied | denied |
| `_gstr1FilingBatches/{filingBatchId}` | Admin SDK only | denied | denied |
| `_gstr1ReportManifests/{reportId}` | Admin SDK only | denied | denied |
| `_subscriptionAuditLog/{eventId}` | Admin SDK only (append-only discipline) | denied | denied |
| `_processedBillingEvents/{idempotencyKey}` | Admin SDK only | denied | denied |
| `_billingEventLedger/{financialEventId}` | Admin SDK only (immutable ledger) | denied | denied |
| `_revenueReports/{monthKey}` | Admin SDK only | denied | denied |
| `_trialLedger/{trialIdentityHmac}` | Admin SDK only; survives account deletion | denied | denied |
| `_billingRateLimits/{bucketId}` | Admin SDK only (transactional buckets) | denied | denied |
| `globalStats/paperSaved` | Admin SDK only | public (`read: if true`) | denied |

Notes:

- `status.quotaEnforcementEnabled` is the Phase-G per-user rollout switch for
  quota rules. Until the backend writes a status doc with the flag true,
  record creates behave exactly as before billing existed (emulator-proven).
- `_subscriptionAuditLog` append-only is a backend write-discipline invariant
  (Admin SDK bypasses Rules; Phase B enforces create-only in the engine plus
  contract tests). Client-side it is simply inaccessible. **Phase B privacy
  correction:** audit documents store `diagnosticUid` only (HMAC-SHA256 of
  uid with `BILLING_DIAG_UID_SECRET`, truncated to 16 hex). Raw Firebase
  `uid` is not stored on audit records. `_companyBilling` remains keyed by
  uid (authoritative server-only account record). `_billingEventLedger`
  retains uid for refund/revenue attribution and is server-only.
- `_trialLedger` ids come from
  `HMAC-SHA256(TRIAL_IDENTITY_SECRET, normalizeE164(phone))`
  (`functions/src/billing/trialIdentity.ts`); no raw phone or uid is stored
  (`lastAccountUidDiagnostic` is a truncated digest).
- `globalStats/paperSaved` figures are labelled estimates with a methodology
  string (owner decision W-9); other `globalStats/*` docs are default-denied.

## Phase-B financial-core invariants (VYD-31 correction round)

- **Transaction shape.** Every billing mutation runs as ONE transaction with
  an explicit read phase (processed event, subscription status, company
  billing, financial ledger row when the request carries a financial event,
  plus hook reads) followed by an explicit write phase. Prepare hooks receive
  a read-only transaction view and return planned writes; no read ever
  follows a write (`applyTransition.ts`; proven against real Firestore by
  `test:billing-transaction-emulator` and enforced in unit tests by the
  Firestore-strict `MemoryBillingStore`).
- **Financial ledger identity.** `_billingEventLedger` doc ids are
  `{platform}:{eventClass}:{storeTransactionId}` (e.g.
  `android:purchase:GPA.x`, `android:refund:GPA.x`). The event class is part
  of the identity: a purchase and a refund of the SAME store transaction
  coexist as separate immutable rows, duplicate deliveries of the same class
  deduplicate, and a conflicting duplicate (same id, different amount/type/
  uid/sku) fails closed. Refunds are not assumed to carry new store ids.
- **Idempotency fingerprint.** `_processedBillingEvents.requestFingerprint`
  is a SHA-256 over the COMPLETE semantic payload (uid, source, eventSource,
  occurredAt, kind, plan, cancelledAt, gracePeriodEndsAt, accessRevoked,
  historyType, full platform event incl. `credentialFingerprint`, full
  financial event). Processing time (`nowMs`, `reconciledAt`) and randomized
  ciphertext are deliberately excluded so a retried event stays idempotent
  while any semantic drift under a reused key fails closed.
- **Trial idempotency key.** Trial grants use
  `trial:<sha256(identityHmac:diagnosticUid:mode)>` — opaque, deterministic,
  containing no raw uid, no phone, and not exposing the trial identity HMAC.
  The grant result returned toward callables carries no identity material.
- **Trial eligibility.** A trial may only follow "no prior status doc" or an
  explicit server-created never-subscribed state (free/inactive/
  `neverSubscribed`, no platform, no product, no trial timestamps). Current
  or historic paid ownership — active, grace, cancelled-period-active,
  on-hold, or expired-paid — rejects fail-closed
  (`trial_prior_state_ineligible`), and a repeated grant never extends an
  existing trial.
- **Out-of-order event safety (ownership contract).** Platform adapters
  (Phase C/D) OWN reconciliation: they MUST fetch the current authoritative
  subscription state from Google/Apple and stamp
  `VerifiedPlatformEvent.reconciledAt` before invoking the engine — raw
  historical webhook payloads are never fed in directly. The engine adds
  defense in depth: `_companyBilling.lastReconciledAt` is a monotonic
  watermark and platform-sourced transitions with an older `reconciledAt`
  are rejected (`stale_platform_state`); equal timestamps (one reconciliation
  feeding callable + webhook paths) remain allowed.
- **Credential envelope.** `encryptedPurchaseCredential.ciphertext` is a
  true KMS envelope: per-credential random 256-bit DEK, local AES-256-GCM
  (random 96-bit IV, 128-bit tag, algorithm bound as AAD), DEK wrapped by
  Cloud KMS; layout `[version][wrapped-DEK length][wrapped DEK][IV][tag]
  [ciphertext]` base64-encoded, with `keyVersion` = KMS key resource name and
  `algorithm = GOOGLE_KMS_ENVELOPE_AES256GCM_V1`. The plaintext DEK is never
  persisted and is zeroized after use; without KMS config every call fails
  closed (`kms_unavailable`). KMS itself is NOT enabled in Phase B.

## Canonical SKU catalog (owner decision W-1)

`functions/src/billing/products.ts`:

- 9 canonical SKUs `vyd_{starter|professional|business}_{monthly|quarterly|yearly}`.
- Android: 3 subscription products (`vyd_starter`, `vyd_professional`,
  `vyd_business`) × base plans `monthly|quarterly|yearly` (no underscores).
- iOS: provisional product identifiers
  `com.specialsoftwares.vyaamikkdiary.{plan}.{period}` until ASC products
  exist (W-7).
- Expected commercial prices are integer-paise CONFIG for tests/marketing;
  purchase UI must use store-localized prices.
- Reverse lookups return `null` for unknown combinations — verification must
  hard-fail, never default a plan.

## Option-C quota design (owner decision W-6)

Authoritative principle: **billable record CREATE + usage transition are one
atomic Firestore batch**, validated bidirectionally by Rules:

1. Record side (`usageConsumedForRecord`): under enforcement, a billable
   create is valid only if `getAfter(usageCurrent)` (post-batch state) points
   at exactly this record (`lastRecordCollection`/`lastRecordId`), carries the
   rules-derived IST `monthKey`, and represents a genuine transition relative
   to the pre-batch counter: `+1` in the same month, or reset-to-1 when the
   stored month differs (lazy rollover), or `== 1` when no counter existed.
2. Counter side (`usageLinkedRecordCreatedInBatch` + shape/cap checks): the
   counter write must use `hasOnly` shape, the rules-derived `monthKey`, an
   exact `+1`/reset transition, stay within `monthlyRecordCap`, and point at
   a record in an allowlisted billable collection that does **not** exist
   before the batch and **does** exist after it.

`monthlyRecordCap` is **fail-closed**: only the exact strings `starter`
(→ 100), `professional` and `business` (→ unlimited) are recognized;
everything else — `free`, a missing field, a lapsed entitlement, a malformed
value (`proffesional`) or an unknown future enum (`enterprise`) — gets the
free cap of 25. A backend typo, migration error or corrupted status document
can therefore never silently grant unlimited quota (emulator-proven with
malformed and unknown active plans at 25/25).

Consequences (all emulator-proven in `firestore.rules.billing.test.ts`):

- one cloud create = at most one consumption;
- cannot create without consumption (including first-ever create);
- cannot consume without a same-batch create (standalone counter writes are
  impossible);
- cannot consume the same create twice (replay denied: the record exists
  pre-batch);
- +2 jumps, stale/future month keys, over-cap writes, cross-user batches and
  non-allowlisted collections are all denied;
- two racing final-slot batches: exactly one commits (absolute counter values
  make the loser's transition invalid regardless of ordering).

### Linkage model comparison (owner spec §14)

Chosen: **pointer fields on `usageCurrent`** (`lastRecordCollection`,
`lastRecordId`) + bidirectional batch checks.

Rejected alternative: per-create event docs
`users/{uid}/subscriptionUsageEvents/{recordType_clientRecordId}`.

| Criterion | Pointer on counter (chosen) | Usage-event docs |
| --- | --- | --- |
| Extra writes per create | 0 (counter is written anyway) | +1 doc forever |
| Rule complexity | 2 helper functions, no cleanup rules | event-create rule + counter rule + cross-checks |
| Offline batch behavior | identical (one batch) | identical but heavier batch |
| Replay semantics | atomicity + `!exists` suffices | deterministic id also works |
| Cleanup | none (single doc) | unbounded collection needs TTL/cleanup |

Both models prove the same three properties; the pointer model is the
smallest design that does, so W-6's "smallest sufficient" criterion selects
it. The stale-pointer loophole (pointer left aiming at a deleted record) is
closed by requiring the genuine `+1` transition on the record side — an
unchanged counter can never satisfy it.

### Phase-A scope and Phase-G generalization

Phase A wires the create-side clause into **`purchaseOrders` only**
(representative path) and allowlists only `purchaseOrders` in
`quotaLinkedCollection(...)`. Generalization = adding the other billable
collections (`entries`, `customerCreditRecords`, `professionalPacks`,
`letterheadDocs`) to the same two touch points plus the client batch
integration — the pattern itself is collection-agnostic (the emulator suite
demonstrates the allowlist boundary with a `letterheadDocs` attempt).
`_saveLocks`, `completedSteps[]`, `clientRecordId`, `idempotencyKey` and
serial counters are untouched by design (W-6).

### Phase-G acceptance criteria — REAL production write sets (mandatory)

Phase A proves the atomic Rules primitive with a minimal batch (record +
`usageCurrent`). That is deliberately NOT the production write shape: real
creates also involve serial counters and save-coordination writes. **Before
`quotaEnforcementEnabled` may be turned on for ANY record family, Phase G
must emulator-test the ACTUAL production write set of that family — every
write that participates in creation — not the minimal Phase-A pair.**

Minimum required write-set proofs:

- **Purchase Order:** record create + `usageCurrent` transition + the
  existing `counters/purchaseOrder` serial increment
  (`next == resource.data.next + 1`).
- **Cash Paid:** entry create + `usageCurrent` transition + the existing
  `counters/cashPaidVouchers` financial-year counter (same-year `count + 1`
  AND year-rollover `count == 1` variants).
- Equivalent real write sets for every remaining billable family (diary
  entries incl. the offline sync-flush path, Customer Credit + its
  `counters/customerCredit` serial, Professional Packs, Letterhead docs +
  `config/*` template writes), plus the `_saveLocks` writes wherever the
  production flow issues them.

Each family's proof must demonstrate, in the rules emulator, that:

1. the full atomic operation succeeds within Firestore Rules
   document-access limits (max 20 access calls per batch/transaction —
   measure the worst-case family, not the average);
2. existing serial-counter invariants remain intact (monotonic +1, cash-paid
   FY rollover semantics) alongside the quota transition;
3. the quota binding remains intact in the enlarged batch (all eleven
   Phase-A security cases re-hold against the production write shape);
4. a replayed save does not increment EITHER the quota counter OR the serial
   counter unexpectedly;
5. the final-slot race stays correct under the actual production
   batch/transaction shape (exactly one winner; serial counters not burned
   by the loser);
6. save idempotency does not regress (`_saveLocks`, `completedSteps[]`,
   `clientRecordId`, `idempotencyKey` behavior byte-identical for users with
   enforcement off, and semantically unchanged with enforcement on).

Phase G may not enable enforcement for a family whose real write set has not
passed all six proofs. (Documentation/acceptance-criteria only — nothing of
Phase G is implemented in Phase A.)

## Timestamp authority (decision)

`usageCurrent.updatedAt` and `preferences/billingUx.updatedAt` (and
`billingUx.benefitScreenShownAt`) are **client-supplied epoch millis and are
NON-AUTHORITATIVE metadata**: no Rules authorization or ordering decision
reads them (they are only type-checked). Authorization/ordering derive from
`request.time` (the rules-computed IST month key), counter monotonicity and
batch linkage — never from these fields. This matches the shipped repo
convention (serial counters, `_saveLocks`, `trustedDevices` all carry client
int timestamps as metadata). Server-written billing docs (`status`, history,
ledgers) get server-side timestamps from the Admin SDK in Phase B+. No
`request.time`-equality enforcement is added — it would be a style refactor
with no authorization gain.

## Month rollover (owner spec §15)

IST (Asia/Kolkata, fixed +05:30, no DST) month key `"YYYY-MM"`, derived
**server-side in Rules** from `request.time`:

```
istMonthKey() = (request.time + duration.value(19800,'s')).year()/.month()
```

mirrored exactly by `functions/src/billing/istMonthKey.ts`. Clients never
choose the month: any counter write whose `monthKey` differs from the
rules-derived value is denied.

Proof chain:

1. `istMonthKey.unit.test.ts` — deterministic boundary proof at the exact
   owner-required instants: `2026-09-30 23:59 IST → 2026-09` and
   `2026-10-01 00:00 IST → 2026-10` (UTC 18:29/18:30), plus year rollover,
   padding, and an Intl `Asia/Kolkata` cross-check of the fixed-offset
   formula.
2. Emulator — rules/TS agreement at evaluation time: batches using the TS
   month key are ALLOWED while previous/next-month keys are DENIED, and lazy
   rollover (stale stored month → reset to 1 under the current IST month
   only) is proven. The emulator clock cannot be frozen at the boundary
   instant; determinism at the boundary is carried by (1) and the two
   implementations being the same fixed-offset formula, with (2) proving the
   live equivalence.

Rollover is lazy inside the atomic transition — no scheduler is required for
correctness (a Phase-J scheduled normalizer is hygiene only).

## Offline policy (owner spec §16, locked)

An offline-created limited-plan record is **PROVISIONAL / UNSYNCED** until
the server accepts the authoritative atomic create + quota transition at
flush time. It must never be presented as synced/quota-approved before that.
Server authorization protects authoritative cloud records and server-backed
entitlements; no enforcement claim is made over local SQLite data. Phase G
owns the sync-flush batching and the quota-exhausted resolution UX (see
threat model §5).

## Indexes (owner spec §20)

**No new indexes in Phase A.** No billing query exists yet. The one
anticipated client query — sanitized billing history, latest 12
(`subscriptionBillingHistory` ordered by `occurredAt` desc, limit 12) — is a
single-field order-by served by Firestore's automatic single-field indexes.
A composite index becomes necessary only if a filtered+ordered variant
appears in a later phase; it will be added with the query that requires it.

## VYD-40 GST / tax documents (fail-closed foundation)

- Invoice source of truth is `_subscriptionInvoices/{invoiceId}` with
  `invoiceId` derived from `financialEventId`. `_companyBilling.latestTaxDocumentId`
  is a pointer only.
- Billing history remains `users/{uid}/subscriptionBillingHistory/{eventId}`
  with optional additive tax fields. Absent fields on older events are valid.
- Production TAX INVOICE issuance stays fail-closed until seller certificate
  fields, SAC/rate, and (for Apple) platform tax policy are owner/CA confirmed.
- Cloud Run HTML→PDF renderer is selected but **not deployed** in VYD-40.
  See `docs/BILLING_VYD38_BILLING_DETAILS_UX.md` for the deferred Billing
  Details UI.
