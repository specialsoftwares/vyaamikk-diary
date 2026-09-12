/**
 * Vyaamikk Diary — Billing domain model (Phase A).
 *
 * Pure types and constants only. No runtime logic is deployed from this file.
 * These contracts are the single source of truth for the Firestore schema
 * documented in docs/BILLING_FIRESTORE_SCHEMA.md and enforced by
 * firestore.rules. Later phases (B+) implement the transition engine against
 * these types; nothing here talks to Firestore, Google Play or the App Store.
 *
 * Security invariants encoded by these types:
 * - The client is NEVER authoritative for entitlements. All documents below
 *   except `BillingUxPreferencesDoc` and the narrowly scoped
 *   `UsageCurrentDoc` quota transition are written exclusively by the Admin
 *   SDK (which bypasses Firestore Rules).
 * - Purchase credentials (Google purchase tokens, Apple signed transactions,
 *   receipts) are SECRET MATERIAL. They may only ever be persisted inside
 *   `EncryptedPurchaseCredential.ciphertext` (Cloud KMS envelope encryption,
 *   owner decision W-3). No plaintext credential field exists in this model
 *   on purpose — do not add one.
 * - All money values are integer paise (INR). Never floats, never rupees.
 */

// ---------------------------------------------------------------------------
// Plans and billing lifecycle
// ---------------------------------------------------------------------------

/** Canonical Vyaamikk plans. `free` is the implicit plan when no status doc exists. */
export type VyaamikkPlan = "free" | "starter" | "professional" | "business";

/**
 * Billing lifecycle status. NEVER use this alone to decide access —
 * entitlement is derived (`entitlementActive`), because e.g. `cancelled`
 * retains access until the paid period ends and `grace` retains access
 * during payment recovery.
 */
export type BillingLifecycleStatus =
  | "trial"
  | "active"
  | "grace"
  | "onHold"
  | "cancelled"
  | "expired";

/** Why `entitlementActive` currently has its value (diagnostic + UX copy key). */
export type EntitlementReason =
  | "neverSubscribed"
  | "trialActive"
  | "trialExpired"
  | "storeSubscriptionActive"
  | "graceRetained"
  | "cancelledPeriodRemaining"
  | "onHoldAccessRevoked"
  | "subscriptionExpired"
  | "adminGrant";

/** Store platform that owns the current subscription, if any. */
export type BillingPlatform = "android" | "ios";

/** Every actor that may mutate billing state (audit `updatedBy` / `source`). */
export type BillingMutationSource =
  | "trialGrant"
  | "androidValidation"
  | "iosValidation"
  | "rtdn"
  | "assnV2"
  | "scheduler"
  | "admin";

// ---------------------------------------------------------------------------
// users/{uid}/subscription/status  (server-written; owner read-only)
// ---------------------------------------------------------------------------

export interface SubscriptionStatusDoc {
  plan: VyaamikkPlan;
  billingStatus: BillingLifecycleStatus;
  /** Derived by the backend `deriveEntitlement(...)` — the ONLY access truth. */
  entitlementActive: boolean;
  entitlementReason: EntitlementReason;
  /** Millis since epoch, or null where not applicable. */
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  platform: BillingPlatform | null;
  /** Store product id (Android productId / iOS product identifier). */
  productId: string | null;
  /** Android base plan id (null on iOS / trial / free). */
  basePlanId: string | null;
  autoRenewing: boolean;
  cancelledAt: number | null;
  gracePeriodEndsAt: number | null;
  /** Plan that takes effect at next renewal (downgrade scheduling), if any. */
  scheduledPlan: VyaamikkPlan | null;
  /**
   * Phase G rollout switch for Option-C quota rules. While false (or while
   * this doc does not exist — every user today), record creates behave
   * exactly as before billing existed. Only the Admin SDK can set it.
   */
  quotaEnforcementEnabled: boolean;
  updatedAt: number;
  updatedBy: BillingMutationSource;
}

// ---------------------------------------------------------------------------
// users/{uid}/subscription/usageCurrent  (Option-C atomic quota counter)
// ---------------------------------------------------------------------------

/** Cloud record collections that consume monthly quota when CREATED. */
export type BillableRecordCollection =
  | "entries"
  | "purchaseOrders"
  | "customerCreditRecords"
  | "professionalPacks"
  | "letterheadDocs";

/**
 * The only client-writable billing document, and only via the atomic
 * Option-C transition: a batch that CREATEs exactly one billable record and
 * applies exactly one valid counter transition pointing at that record.
 * Enforced bidirectionally in firestore.rules (see quota proof suite).
 */
export interface UsageCurrentDoc {
  /** IST (Asia/Kolkata) calendar month, "YYYY-MM". Must equal the rules-derived month. */
  monthKey: string;
  /** Records created in `monthKey`. Resets to 1 on the first create of a new month. */
  recordsThisMonth: number;
  /** Linkage: the billable record created in the same atomic batch. */
  lastRecordCollection: BillableRecordCollection;
  lastRecordId: string;
  updatedAt: number;
}

/**
 * Monthly record-creation caps per effective plan. -1 = unlimited.
 * MIRRORED IN firestore.rules (`monthlyRecordCap`) — keep in sync; the rules
 * emulator quota suite exercises 25 and 100 against these constants.
 */
export const UNLIMITED_RECORDS = -1;
export const PLAN_MONTHLY_RECORD_LIMITS: Record<VyaamikkPlan, number> = {
  free: 25,
  starter: 100,
  professional: UNLIMITED_RECORDS,
  business: UNLIMITED_RECORDS,
};

// ---------------------------------------------------------------------------
// users/{uid}/subscriptionBillingHistory/{eventId}  (sanitized; owner read-only)
// ---------------------------------------------------------------------------

export type BillingHistoryEventType =
  | "trialStarted"
  | "trialEnded"
  | "purchaseActivated"
  | "renewed"
  | "graceEntered"
  | "onHoldEntered"
  | "cancelled"
  | "resubscribed"
  | "planChanged"
  | "expired"
  | "refunded";

/**
 * User-visible sanitized billing history. NEVER contains purchase tokens,
 * signed transactions, receipts, or any store credential material.
 */
export interface BillingHistoryEventDoc {
  type: BillingHistoryEventType;
  occurredAt: number;
  planAfter: VyaamikkPlan;
  billingStatusAfter: BillingLifecycleStatus;
  platform: BillingPlatform | null;
  /** Canonical SKU (see products.ts), when the event maps to a paid product. */
  canonicalSku: string | null;
  /** Integer paise actually charged by the store for this event, when known. */
  amountInPaise: number | null;
  currency: "INR" | null;
}

// ---------------------------------------------------------------------------
// users/{uid}/preferences/billingUx  (narrow client-writable UX prefs; NOT entitlement)
// ---------------------------------------------------------------------------

/**
 * The ONLY billing-adjacent doc a client may write. Rules enforce
 * hasOnly(['benefitScreenShownAt','updatedAt']) with int types. No plan,
 * status or trial field may ever be added here.
 */
export interface BillingUxPreferencesDoc {
  benefitScreenShownAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// _companyBilling/{uid}  (server-only; zero client access)
// ---------------------------------------------------------------------------

/**
 * Envelope-encrypted purchase credential (owner decision W-3: Cloud KMS).
 * Firestore at-rest encryption does NOT satisfy the credential-secrecy
 * invariant; `ciphertext` is produced by the Phase B crypto abstraction.
 */
export interface EncryptedPurchaseCredential {
  /** Base64 KMS-envelope ciphertext of the credential (never plaintext). */
  ciphertext: string;
  /** KMS key version used, for rotation. */
  keyVersion: string;
  /** e.g. "GOOGLE_KMS_ENVELOPE_AES256GCM_V1". */
  algorithm: string;
}

export interface CompanyBillingDoc {
  uid: string;
  platform: BillingPlatform;
  canonicalSku: string;
  productId: string;
  basePlanId: string | null;
  /**
   * Store order/transaction identifiers (NOT credentials): Google
   * latestOrderId / Apple originalTransactionId. Used as financial-event and
   * idempotency keys.
   */
  latestOrderId: string | null;
  originalTransactionId: string | null;
  /**
   * SHA-256 hex fingerprint of the raw credential for equality checks without
   * decryption. One-way; never reversible to the credential.
   */
  credentialFingerprint: string | null;
  encryptedPurchaseCredential: EncryptedPurchaseCredential | null;
  /** Google linkedPurchaseToken invalidation chain fingerprints (never raw). */
  invalidatedCredentialFingerprints: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// _subscriptionAuditLog/{eventId}  (append-only; server-only)
// ---------------------------------------------------------------------------

export interface SubscriptionAuditLogEventDoc {
  /** Truncated privacy-safe uid digest (Phase B: HMAC of uid, first 16 hex). */
  diagnosticUid: string;
  uid: string;
  source: BillingMutationSource;
  idempotencyKey: string;
  occurredAt: number;
  fromPlan: VyaamikkPlan | null;
  toPlan: VyaamikkPlan;
  fromBillingStatus: BillingLifecycleStatus | null;
  toBillingStatus: BillingLifecycleStatus;
  entitlementActiveAfter: boolean;
  /** Sanitized context (notification type, store state). NEVER credentials. */
  detail: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// _processedBillingEvents/{idempotencyKey}  (server-only)
// ---------------------------------------------------------------------------

export interface ProcessedBillingEventDoc {
  idempotencyKey: string;
  source: BillingMutationSource;
  processedAt: number;
  /** Short machine summary, e.g. "activated:vyd_professional_yearly". */
  resultSummary: string;
}

// ---------------------------------------------------------------------------
// _billingEventLedger/{financialEventId}  (immutable financial ledger; server-only)
// ---------------------------------------------------------------------------

export type FinancialEventType = "purchase" | "renewal" | "refund" | "chargeback";

/**
 * Revenue is derived ONLY from this ledger of verified store transactions.
 * `financialEventId` is the store order/transaction id, which makes a
 * validation-path write and a webhook-path write of the same financial event
 * collide into one ledger entry (double-count prevention).
 */
export interface BillingEventLedgerDoc {
  financialEventId: string;
  platform: BillingPlatform;
  uid: string;
  canonicalSku: string;
  eventType: FinancialEventType;
  grossAmountInPaise: number;
  currency: "INR";
  /** Store-reported fee when available; null until known. */
  actualPlatformCommissionInPaise: number | null;
  /** Clearly-named estimate used ONLY when the store does not report the fee. */
  estimatedPlatformCommissionInPaise: number | null;
  occurredAt: number;
  /** IST month bucket for revenue reports. */
  monthKey: string;
  recordedAt: number;
  recordedBy: BillingMutationSource;
}

// ---------------------------------------------------------------------------
// _revenueReports/{monthKey}  (server-only)
// ---------------------------------------------------------------------------

export interface RevenueReportDoc {
  monthKey: string;
  grossRevenueInPaise: number;
  refundsInPaise: number;
  actualPlatformCommissionInPaise: number;
  estimatedPlatformCommissionInPaise: number;
  netRevenueEstimateInPaise: number;
  financialEventCount: number;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// _trialLedger/{trialIdentityHmac}  (server-only; survives account deletion)
// ---------------------------------------------------------------------------

/**
 * One-trial-per-durable-identity ledger (owner decisions W-4/W-5).
 *
 * Document id = HMAC-SHA256(TRIAL_IDENTITY_SECRET, normalizeE164(phone)) hex
 * (see trialIdentity.ts). No raw phone number is ever stored. Purpose:
 * prevention of repeat-trial abuse. This ledger deliberately SURVIVES normal
 * account deletion (unlike phoneIndex, which is freed) — deletion + re-signup
 * with the same phone must not re-grant a trial. A future admin override
 * exists for legitimate mobile-number reassignment; Phase A ships schema only.
 */
export interface TrialLedgerDoc {
  trialUsed: boolean;
  firstTrialStartedAt: number;
  /** Truncated diagnostic digest of the granting uid (never the raw uid). */
  lastAccountUidDiagnostic: string;
  /** Admin reassignment override (W-5). False by default; no UI in Phase A. */
  overrideAllowed: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// _billingRateLimits/{bucketId}  (server-only)
// ---------------------------------------------------------------------------

/**
 * Transactional rate-limit buckets, modeled on the shipped
 * emailOtpRateLimits pattern. bucketId = "<op>_<diagnosticUid>_<windowKey>".
 * Caps (spec): purchase validation 5/uid/min, entitlement refresh 10/uid/hour.
 */
export interface BillingRateLimitBucketDoc {
  count: number;
  updatedAt: number;
  /** Window end + slack, for a Firestore TTL policy. */
  expireAt: number;
}

// ---------------------------------------------------------------------------
// globalStats/paperSaved  (public read; server-written)
// ---------------------------------------------------------------------------

/** All figures are clearly-labelled ESTIMATES (owner decision W-9). */
export interface PaperSavedStatsDoc {
  pagesSavedEstimated: number;
  treesEstimatedSaved: number;
  /** Human-readable methodology + source note; required by W-9. */
  estimateMethodology: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Trial constants (owner decision W-10)
// ---------------------------------------------------------------------------

/** One Vyaamikk-controlled trial: 14 days of Professional entitlement. */
export const TRIAL_DURATION_DAYS = 14;
export const TRIAL_PLAN: VyaamikkPlan = "professional";

// ---------------------------------------------------------------------------
// Feature keys (forward-looking; see owner decisions W-11/W-12)
// ---------------------------------------------------------------------------

/**
 * Plan feature identifiers anticipated by the schema. NOTE (W-11/W-12):
 * `multiBusinessProfiles`, `aiFeatures`, `csvExport` and `freeTierWatermark`
 * are FUTURE dependencies — they must not be advertised as presently
 * available, and the live paywall may only advertise implemented features.
 */
export type PlanFeatureKey =
  | "businessInsights"
  | "cashPaidFullLegalRecord"
  | "statutoryReminders"
  | "letterheadDocuments"
  | "professionalPacks"
  | "purchaseOrders"
  | "customerCredit"
  | "multiBusinessProfiles"
  | "aiFeatures"
  | "csvExport";

/** Business plan anticipates at most 3 business profiles (W-11; not built yet). */
export const BUSINESS_PLAN_MAX_BUSINESS_PROFILES = 3;
