# Vyaamikk Diary — Billing Threat Model (Phase A)

Status: Phase A foundation (schema + Firestore authorization). Owner decisions
W-1…W-12 locked 2026-09-12. Backend engine, store APIs, webhooks and client
IAP are later phases; threats they own are still modeled here so the schema
and Rules shipped in Phase A cannot paint them into a corner.

Baseline architecture facts this model is tied to:

- All record saves are **client-direct Firestore writes** (firebase JS SDK)
  funneled through the client-side `saveCoordinator` (convenience, not
  security). There are no record-create Cloud Functions.
- Entitlement truth lives in `users/{uid}/subscription/status`, written only
  by the Admin SDK (Rules deny all client mutation).
- Option-C quota: a billable record CREATE and a `usageCurrent` transition
  are validated as **one atomic Firestore batch** by `firestore.rules`
  (emulator-proven in `firestore.rules.billing.test.ts`).
- Enforcement is activation-gated per user by the server-written
  `quotaEnforcementEnabled` flag; the flag is off / the doc absent for all
  users until Phase G.

---

## Threats

### 1. Modified client (rebuilt APK, patched JS bundle)

- **Asset:** entitlements, monthly record quota.
- **Attacker capability:** full control of app code and local storage; can
  call any SDK API with the user's real auth token.
- **Security boundary:** Firestore Rules + (future) callable-side checks.
  Client code, `useSubscription` caches and `saveCoordinator` are explicitly
  NOT boundaries.
- **Mitigation:** `subscription/status` is client-immutable;
  quota is enforced in Rules atomically with the record write; feature gates
  re-derived server-side in later phases (AI/export endpoints). App Check is
  a future hardening layer (monitor → enforce), not assumed here.
- **Residual risk:** UI-only features that never touch the server (e.g. a
  gated screen rendering local data) can be unlocked cosmetically on a
  patched client. Accepted: no server data or quota is obtainable that way.

### 2. Direct Firestore REST/SDK attack (no app at all)

- **Asset:** all billing documents; record quota.
- **Attacker capability:** raw Firestore REST/gRPC calls with a valid user ID
  token; arbitrary batch composition; arbitrary field values.
- **Security boundary:** Firestore Rules only.
- **Mitigation:** every billing path has explicit rules; server-only
  collections (`_companyBilling`, `_subscriptionAuditLog`,
  `_processedBillingEvents`, `_billingEventLedger`, `_revenueReports`,
  `_billingMaintenanceSchedule`, `_billingOps`,
  `_trialLedger`, `_billingRateLimits`) are `read/write: false`; the quota
  transition validates shape (`hasOnly`), monotonicity (+1 or reset-to-1),
  cap, IST month, and same-batch record linkage — all proven in the emulator
  suite with hand-built batches (the same primitive an attacker has).
- **Residual risk:** none known beyond documented quota semantics (see 5).

### 3. Forged plan / entitlement

- **Asset:** paid-plan features and caps.
- **Attacker capability:** attempts to write `plan: "professional"`,
  `entitlementActive: true`, or smuggle plan fields into writable docs.
- **Security boundary:** Rules.
- **Mitigation:** `subscription/status` create/update/delete are `false` for
  clients (proof: "case 10" + owner-mutation tests). `preferences/billingUx`
  accepts only `benefitScreenShownAt`/`updatedAt` via `hasOnly` (smuggling
  test). The users-doc profile patch allowlist contains no billing fields.
- **Residual risk:** none known.

### 4. Quota bypass at the write path

- **Asset:** monthly record-creation caps (free 25 / starter 100).
- **Attacker capability:** creative batch composition: create without
  counter, +2 jumps, standalone counter mutation, stale/future `monthKey`,
  two records with one increment, counter pointed at another collection,
  replayed `clientRecordId`.
- **Security boundary:** Rules (bidirectional binding):
  - record side: `usageConsumedForRecord` requires `getAfter(usageCurrent)`
    to point at exactly this record AND to represent a genuine +1/reset
    transition relative to the pre-batch counter;
  - counter side: `usageLinkedRecordCreatedInBatch` requires the pointed-at
    record to not exist before and exist after the same batch, in an
    allowlisted billable collection.
- **Mitigation proof:** emulator cases 1–8, 11, linkage-allowlist and
  cross-user tests. Two-records-one-increment is impossible because the
  final counter state can only point at one record and every billable create
  independently requires the pointer+transition.
- **Fail-closed cap:** `monthlyRecordCap` recognizes only the exact strings
  `starter`/`professional`/`business`; malformed or unknown plan values in a
  corrupted/mis-migrated status doc fall to the free cap of 25 instead of
  defaulting upward to unlimited (emulator-proven with `proffesional` and
  `enterprise` active plans).
- **Phase-G gate:** enforcement may only be enabled per family after the
  REAL production write set (record + usage + serial counters + save locks)
  passes the six acceptance proofs in
  `docs/BILLING_FIRESTORE_SCHEMA.md` ("Phase-G acceptance criteria") —
  access limits, serial invariants, quota binding, replay, final-slot race,
  and save-idempotency non-regression.
- **Residual risk:** delete-and-recreate of the *same* record id cannot mint
  extra live records beyond the cap (each recreation still requires a fresh
  valid consumption; a replay with consumption is denied because the id
  existed pre-batch, and after deletion a recreation consumes a NEW slot).
  A user can therefore burn quota by deleting and recreating — self-harm,
  not gain. Accepted.

### 5. Offline abuse (local SQLite, sync queue)

- **Asset:** perceived quota integrity for offline-created diary entries.
- **Attacker capability:** create unlimited *local* records while offline;
  tamper with local DB freely.
- **Security boundary:** the server accepts an authoritative cloud record
  only via the atomic create+consumption batch at sync time. Local SQLite is
  outside the trust boundary by definition.
- **Policy (owner spec §16, locked):** an offline-created limited-plan record
  is **PROVISIONAL / UNSYNCED** until the server accepts the atomic create +
  quota transition. It must never be presented as definitively
  synced/quota-approved. Server authorization protects authoritative cloud
  records and server-backed entitlements — no claim is made over arbitrary
  local data.
- **Phase-G UX requirement (documented now, built later):** the diary
  local-first path must batch the entry `setDoc` with the usage transition at
  flush time, surface "provisional — will count against your monthly limit
  when synced", and present a clear resolution path when the server rejects
  the flush because the month's quota is exhausted (keep locally + upgrade
  prompt; never silent data loss).
- **Residual risk:** offline device holds unsynced records indefinitely;
  they never become authoritative without passing quota. Accepted.

### 6. Duplicate purchase callback (client retries validation)

- **Asset:** entitlement correctness; audit integrity.
- **Attacker capability:** replays `validateAndActivate*` calls with the same
  store credential (network retries or deliberate).
- **Security boundary:** Phase B transition engine idempotency —
  `_processedBillingEvents/{idempotencyKey}` checked inside the same
  transaction as the entitlement mutation; keys derived from store identifiers
  (e.g. `sha256(purchaseToken)` + `latestOrderId` / `originalTransactionId` +
  revision), NOT from client-supplied nonces.
- **Phase A contribution:** schema + zero-client-access rules for
  `_processedBillingEvents`.
- **Residual risk:** none once Phase B lands; Phase A ships no validation
  endpoint at all.

### 7. Replayed webhook (valid signature, old event)

- **Asset:** entitlement state; revenue ledger.
- **Security boundary:** idempotency keys from platform-unique identifiers
  (Pub/Sub `messageId` pre-filter + store state version; Apple
  `notificationUUID`) and the rule that webhooks only trigger re-verification
  against the store APIs (`purchases.subscriptionsv2.get` / App Store Server
  API) — the notification payload is never the entitlement source.
- **Phase B contract (VYD-31):** adapters own reconciliation and must stamp
  `VerifiedPlatformEvent.reconciledAt` (state-fetch time). The engine
  additionally rejects platform-sourced transitions whose `reconciledAt` is
  older than the persisted `_companyBilling.lastReconciledAt` watermark
  (`stale_platform_state`) — an old-but-validly-signed event replayed after a
  newer state can never regress entitlement.
- **Residual risk:** a replay can cause a redundant store lookup (rate-limited,
  logged), never a duplicate or stale transition.

### 8. Forged webhook (attacker posts to endpoints)

- **Asset:** entitlements, ledger.
- **Attacker capability:** arbitrary HTTPS POSTs to public endpoints.
- **Security boundary (locked architecture):**
  - Google RTDN: **authenticated Pub/Sub push** — verify the OIDC JWT
    (Google-signed RS256, `iss`, `aud` = configured audience, `exp`,
    `email` == configured push service account, `email_verified`), never a
    static bearer/URL token.
  - Apple ASSN v2: **`@apple/app-store-server-library` SignedDataVerifier**
    (ES256 + x5c chain to pinned Apple Root CAs + bundleId + environment +
    production `appAppleId`), never Sign-in-with-Apple JWKS. Online certificate
    checks (`enableOnlineChecks` / OCSP) are **off** in VYD-33 so CI stays
    deterministic; enabling them is an explicit go-live security/availability
    decision. ASSN `notificationType` (including `REFUND_REVERSED`,
    prorated refund, missing original sale, and unknown revocation types)
    is a signal only. Current entitlement still comes from Get All
    Subscription Statuses after SignedDataVerifier checks, even when the
    financial correction is held in `_appStoreFinancialReview`.
    Authenticity/ownership/integrity failures still block entirely.
    Applied App Store offer fields (`offerType`, `offerIdentifier`,
    `offerDiscountType`, `offerPeriod` on transaction or renewal) fail closed
    (`unsupported_ios_store_offer`) before mutation; eligibility fields such
    as `eligibleWinBackOfferIds` are not applied-offer state.
    Contradictory signed status items that claim the requested
    `originalTransactionId` fail closed rather than skipping to another
    candidate. Known out-of-scope ASSN shapes (`RENEWAL_EXTENSION` SUMMARY,
    `EXTERNAL_PURCHASE_TOKEN`, `RESCIND_CONSENT`) are acknowledged without
    billing mutation after SignedDataVerifier. Durable ASSN work is incident-
    scoped by verified `notificationUUID`.
    Apple 2026 `billingPlanType` `MONTHLY` / non-empty `commitmentInfo`
    fail closed (`unsupported_ios_commitment_billing_plan`); commitment
    products are not implemented. iOS live-status queue ids are
    event-scoped and incident-scoped (`originalTransactionId` + durable
    financial event + callable vs ASSN UUID).
    Financial-review `diagnosticUid` is forensic only and is not identity.
    Transitive `jsrsasign@11.1.5` (via the official Apple library 3.1.0)
    is a production-enablement dependency watch, not a VYD-33 merge
    blocker; do not override Apple's cryptography package.
- **Residual risk:** compromise of Google/Apple signing infrastructure —
  out of scope.

### 9. Cross-user billing read

- **Asset:** another user's plan/usage/history (PII-adjacent).
- **Security boundary:** Rules `isOwner(uid)` on `subscription/*`,
  `subscriptionBillingHistory/*`, `preferences/billingUx`; blanket deny on
  all `_*` billing collections (including `_companyBilling/{uid}` for the
  "owning" uid — emulator-proven).
- **Residual risk:** none known.

### 10. Purchase-token / credential leakage

- **Asset:** Google purchase tokens, Apple signed transactions/receipts
  (SECRET MATERIAL per spec).
- **Attacker capability:** reads client-accessible Firestore, app logs,
  analytics, callable error payloads, Jira/test fixtures.
- **Security boundary + mitigations:**
  - Schema: the ONLY persisted credential field is
    `_companyBilling.encryptedPurchaseCredential.{ciphertext,keyVersion,algorithm}`
    (Cloud KMS envelope, W-3); a one-way `credentialFingerprint` supports
    equality checks without decryption. No plaintext credential field exists
    in the domain model on purpose.
  - Rules: `_companyBilling` unreadable by any client.
  - Client-readable docs (`status`, `usageCurrent`, history) contain no
    credential fields by type contract.
  - Phase B contract tests must assert credentials never appear in logs,
    errors, history or audit `detail` (static + unit checks).
- **HARD STOP (W-3):** no production deployment until KMS + IAM is
  configured; no production credential is ever persisted in plaintext.
- **Residual risk:** in-memory handling during validation (unavoidable);
  bounded by never-log + never-return discipline and function memory
  isolation.

### 11. Trial recreation abuse (delete → re-signup → new trial)

- **Asset:** one 14-day Professional trial per person (W-10).
- **Attacker capability:** full account deletion (frees `phoneIndex`,
  deletes the Auth user, retires the UEID) followed by re-signup with the
  same phone → brand-new uid + UEID.
- **Security boundary:** `_trialLedger/{trialIdentityHmac}` keyed by
  `HMAC-SHA256(TRIAL_IDENTITY_SECRET, normalizeE164(phone))`
  (`functions/src/billing/trialIdentity.ts`), consulted by the Phase-B trial
  grant. The ledger stores no raw phone and **deliberately survives normal
  account deletion** — its documented purpose is prevention of repeat-trial
  abuse.
- **Recycled numbers (W-5):** same durable identity ⇒ no automatic second
  trial. A legitimate new owner of a recycled number is handled by a future
  admin override (`overrideAllowed` metadata reserved; no UI in Phase A).
- **Phase B hardening (VYD-31):** the grant additionally requires an eligible
  prior state (no status doc, or an explicit server-created never-subscribed
  state) — a trial can never overwrite current or historic paid access, and a
  retried grant never extends an existing trial. The trial idempotency key is
  an opaque digest (`trial:<sha256(identityHmac:diagnosticUid:mode)>`), so no
  raw uid/phone/identity material reaches audit or processed-event records.
- **Residual risk:** a person with multiple phone numbers can obtain one
  trial per number. Accepted (documented owner decision).

### 12. Billing-event double count (validation + webhook for one purchase)

- **Asset:** `_billingEventLedger` / `_revenueReports` accuracy.
- **Security boundary:** `financialEventId` =
  `{platform}:{eventClass}:{storeTransactionId}` (VYD-31), so the validation
  path and the webhook path collide into ONE ledger doc per event class,
  while a purchase and a refund of the same store transaction coexist as
  distinct immutable rows; a conflicting duplicate (same id, different
  amount/type) fails closed. Revenue derives only from this ledger, never by
  summing processing events. Commission fields are split into
  `actualPlatformCommissionInPaise` vs
  `estimatedPlatformCommissionInPaise` (never conflated).
- **Residual risk:** store-side order-id semantics changes; covered by Phase
  B contract tests against recorded API fixtures.

### 13. Rate-limit bypass

- **Asset:** store API quotas, abuse surface of validation/refresh callables.
- **Security boundary:** Phase B transactional buckets in
  `_billingRateLimits` (bucket id = op + diagnostic uid + window), modeled on
  the shipped `emailOtpRateLimits` transaction pattern; caps: purchase
  validation 5/uid/min, refresh 10/uid/hour. UID-based, not IP/device-based.
- **Phase A contribution:** schema + zero-client-access rules (bucket
  tampering by clients impossible).
- **Residual risk:** distributed abuse across many real accounts — bounded by
  phone-verified signup cost.

### 14. Store/environment mismatch (sandbox-as-production, wrong package)

- **Asset:** production entitlements.
- **Attacker capability:** presents sandbox/test purchases, purchases for a
  different package/bundle, or valid tokens for someone else's product.
- **Security boundary (locked):** Android verification pins
  `com.specialsoftwares.vyaamikkdiary` (NEVER the truncated variant) and
  validates productId/basePlanId against the canonical catalog
  (`canonicalSkuForAndroid` returns null ⇒ hard fail, no default plan);
  `testPurchase` handling and Apple `Environment.PRODUCTION` +
  `bundleId` + `appAppleId` checks reject cross-environment data on
  production. Unknown SKUs never map to entitlements.
- **Residual risk:** internal test builds intentionally accepting sandbox —
  isolated by explicit build-flagged configuration in later phases.

### 15. GST tax documents and GSTR working papers (VYD-40)

- **Asset:** tax invoices, GSTIN, registered addresses, GSTR working papers.
- **Security boundary:** server-only collections; Storage `company/invoices/**`
  and `company/gstr1-reports/**` are client-denied; download URLs are
  owner-only signed URLs resolved from `taxDocumentId` (never a client-supplied
  Storage path). Admin GSTIN verification and GSTR marking stay fail-closed
  until admin identity is provisioned (`token.admin === true`).
- **Residual risk:** production invoice issuance is intentionally blocked
  until seller certificate / SAC / Apple policy gates are resolved. Cloud Run
  renderer is unimplemented in production (not deployed).

---

## Configuration vs secret classification (owner spec §1)

SECRET MATERIAL (Secret Manager via `defineSecret`, Phase B+):

- `BILLING_DIAG_UID_SECRET` — HMAC key for privacy-safe diagnostic uids.
- `TRIAL_IDENTITY_SECRET` — HMAC key for `_trialLedger` identities (≥ 32
  chars enforced by `trialIdentity.ts`; never committed, never logged).
- `APPSTORE_PRIVATE_KEY` — App Store Server API .p8 private key.
- Google service-account private credential **only if** ADC cannot be used.
- KMS key material — managed inside Cloud KMS, never exported.

CONFIGURATION / IDENTIFIERS (parameters/env, NOT Secret Manager):

- `PLAY_RTDN_PUSH_SERVICE_ACCOUNT`, `PLAY_RTDN_PUSH_AUDIENCE`
- `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_APP_APPLE_ID`
- `APPSTORE_BILLING_ENABLED` (default false), `APPSTORE_ENVIRONMENT`
- `APPSTORE_ROOT_CA_CERTS_BASE64` (Apple root CA DER material; not the .p8)
- Compile-time gates: `APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED`,
  `APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED` (both false).
  Apple JWS price is not accounting authority.
- `BILLING_KMS_KEY_NAME`
- Android package / iOS bundle id (already in `app.json`)
- `INVOICE_RENDERER_URL`, `COMPANY_GSTIN`, `SERVICE_SAC_CODE`,
  `SERVICE_SAC_DESCRIPTION`, `GST_RATE_BPS`, `BILLING_EMAIL_FROM_ADDRESS`
  (VYD-40 placeholders; missing values fail closed)

---

## Explicit non-goals of Phase A

No Cloud Functions, KMS wiring, store APIs, webhook endpoints, IAP
dependency, purchase UI, record-repository migration, or deployment of any
kind. The Rules shipped here change nothing for current users: quota coupling
activates only when the server writes `quotaEnforcementEnabled: true`
(Phase G), and no `subscription/status` documents exist before Phase B.
