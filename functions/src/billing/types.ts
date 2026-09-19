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
export type QuotaLinkedRecordCollection =
  | "entries"
  | "purchaseOrders"
  | "customerCreditRecords"
  | "professionalPacks";

/**
 * `letterheadDocs` remains on this union only because historical
 * `usageCurrent.lastRecordCollection` values may still name it. New letterhead
 * creates must not write usage.
 */
export type BillableRecordCollection = QuotaLinkedRecordCollection | "letterheadDocs";

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
  /** Optional GST/tax-document pointers (VYD-40). Absent on pre-GST events. */
  taxDocumentId?: string | null;
  taxDocumentNumber?: string | null;
  taxDocumentType?: string | null;
  taxableAmountInPaise?: number | null;
  taxAmountInPaise?: number | null;
  totalInPaise?: number | null;
  invoiceAvailableForDownload?: boolean | null;
  gstinVerificationStatus?: string | null;
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

/**
 * Server-only Google Play obfuscated-account ownership index (VYD-32).
 * Path: `_playAccountIndex/{obfuscatedAccountId}` — zero client access.
 * `obfuscatedAccountId` is SHA-256("vyd-play-account-v1:" + uid) hex.
 */
export interface PlayAccountIndexDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Server-only purchase-token fingerprint → uid index (VYD-32).
 * Path: `_playCredentialIndex/{credentialFingerprint}` — zero client access.
 * Document id is SHA-256(purchase token) hex. Never stores the raw token,
 * ciphertext, email, or phone.
 */
export interface PlayCredentialIndexDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Server-only App Store account token owned by a Firebase uid (VYD-33).
 * Path: `_appStoreAccountByUid/{uid}` — zero client access.
 * `appAccountToken` is an opaque UUID generated by the server. No email/phone.
 */
export interface AppStoreAccountByUidDoc {
  appAccountToken: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Server-only reverse index for App Store appAccountToken (VYD-33).
 * Path: `_appStoreAccountIndex/{appAccountToken}` — zero client access.
 * No email/phone.
 */
export interface AppStoreAccountIndexDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Server-only Apple financial-review record (VYD-33).
 * Path: `_appStoreFinancialReview/{stableId}` — zero client access.
 * Used for unsupported Apple financial corrections that must not invent a
 * `_billingReconciliationQueue.financialEventId`. No raw JWS.
 * `financialEventId` is set only when a real ledger row exists and has been
 * integrity-checked (platform, eventType, uid, SKU, related original sale).
 * A later verified id may enrich `null` → that id once; a non-null id is
 * immutable. `diagnosticUid` is forensic only and is not review identity
 * (uid is the owner). `entitlementReconciledAt` / `financialEventLinkedAt`
 * are one-time markers. Financial-review `status` stays `pending`; current
 * entitlement is still applied from Get All Subscription Statuses.
 */
export type AppStoreFinancialReviewStatus = "pending";

export interface AppStoreFinancialReviewDoc {
  reason: string;
  platform: "ios";
  transactionId: string;
  originalTransactionId: string;
  canonicalSku: string | null;
  financialEventId: string | null;
  uid: string;
  /**
   * Forensic HMAC only. Not review identity. A future
   * `BILLING_DIAG_UID_SECRET` rotation must not redefine the economic
   * review; `uid` is the owner.
   */
  diagnosticUid: string;
  createdAt: number;
  updatedAt: number;
  status: AppStoreFinancialReviewStatus;
  entitlementReconciledAt: number | null;
  /**
   * One-time marker set when `financialEventId` is enriched from null to a
   * verified ledger id. Never cleared. Not part of core review identity.
   */
  financialEventLinkedAt: number | null;
}

/**
 * Server-only durable reconciliation work item (VYD-32).
 * Path: `_billingReconciliationQueue/{stableId}` — zero client access.
 * Never stores raw purchase tokens, plaintext credentials, or uid.
 * `financialEventId` is the resolver for the ledger owner.
 */
export type BillingReconciliationQueueStatus =
  | "pending"
  | "leased"
  | "failed_retryable"
  | "resolved"
  | "terminal";

export interface BillingReconciliationQueueDoc {
  reason: string;
  platform: BillingPlatform;
  financialEventId: string;
  credentialFingerprint: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  status: BillingReconciliationQueueStatus;
  attemptCount: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  nextAttemptAt?: number | null;
  lastErrorCode?: string | null;
  terminalReason?: string | null;
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
  /**
   * Monotonic watermark of the newest authoritative store state applied
   * (VerifiedPlatformEvent.reconciledAt). The transition engine rejects
   * platform-sourced transitions older than this watermark (stale-event
   * defense in depth; adapters own reconciliation — see transition.ts).
   */
  lastReconciledAt: number | null;
  /**
   * Pointer only (VYD-40). The invoice source of truth is
   * `_subscriptionInvoices/{invoiceId}` — never copy the full invoice here.
   */
  latestTaxDocumentId?: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// _subscriptionAuditLog/{eventId}  (append-only; server-only)
// ---------------------------------------------------------------------------

export interface SubscriptionAuditLogEventDoc {
  /**
   * Privacy-minimized account identifier: HMAC-SHA256(BILLING_DIAG_UID_SECRET, uid)
   * truncated to 16 hex chars (see diagnosticUid.ts). Raw Firebase uid is NOT
   * stored on audit records — company billing remains keyed by uid because it
   * is the authoritative server-only account record.
   */
  diagnosticUid: string;
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
  /**
   * SHA-256 of the canonical transition (no credentials). A replay with the
   * same idempotency key MUST match; a mismatch fails closed rather than
   * silently accepting a conflicting mutation.
   */
  requestFingerprint: string;
  diagnosticUid: string;
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
  /**
   * Account ownership linkage. Retained because refund/revocation mapping and
   * revenue attribution must resolve to the Firebase account that owns the
   * store transaction. This collection is server-only (Rules deny all client
   * access). Audit logs do NOT copy this field — they use diagnosticUid.
   */
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
  /**
   * Refund/chargeback → original purchase/renewal financialEventId.
   * Purchase/renewal must be null. Required for refund/chargeback.
   */
  relatedFinancialEventId: string | null;
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

// ---------------------------------------------------------------------------
// GST / tax documents (VYD-40) — see functions/src/billing/tax/
// ---------------------------------------------------------------------------

export type TaxResponsibilityMode = "developer" | "platform" | "unconfirmed";

export type PlatformTaxChannel =
  | "google_play_india"
  | "apple_app_store_india"
  | "direct_web_india";

export type TaxDocumentType =
  | "tax_invoice_b2b"
  | "tax_invoice_b2c"
  | "platform_subscription_receipt"
  | "compliance_review_required";

export type GstinVerificationStatus =
  | "not_provided"
  | "pending_manual_verification"
  | "verified"
  | "rejected";

export type BuyerClassification = "b2b" | "b2c";

export type GstTaxType = "cgst_sgst" | "igst" | null;

export type ReverseChargeMode = "yes" | "no" | "unconfirmed";

export type TaxDocumentIssueStatus = "unissued_draft" | "issued";

export type InvoiceIssueHoldReason =
  | "recipient_tax_classification_pending"
  | "recipient_invoice_details_incomplete";

export type TaxPeriodStatus = "pending_issue" | "resolved" | "unresolved_cross_period";

export type TaxPeriodDecisionStatus =
  | "pending_issue"
  | "resolved"
  | "unresolved_cross_period"
  | "requires_tax_review";

export type InvoicePdfStatus =
  | "pending"
  | "awaiting_financial_evidence"
  | "awaiting_renderer"
  | "ready"
  | "failed";

export type InvoiceEmailStatus =
  | "pending"
  | "accepted"
  | "delivered"
  | "bounced"
  | "failed"
  | "skipped_no_verified_email";

export type GstrFilingFrequency = "monthly" | "quarterly";

/**
 * GSTR-1 ECO/Table-14 category. Generic "classified" is not a legal category.
 * Table 14(a) = ECO collects TCS under section 52.
 * Table 14(b) = ECO pays tax under section 9(5).
 */
export type EcoReportingCategory =
  | "requires_tax_review"
  | "not_applicable"
  | "section52_table14a"
  | "section9_5_table14b";

export interface SellerTaxSnapshot {
  legalName: string;
  tradeName: string | null;
  gstin: string;
  registeredAddress: string;
  stateCode: string;
  stateName: string;
}

export interface BuyerTaxSnapshot {
  classification: BuyerClassification;
  legalName: string | null;
  gstin: string | null;
  gstinVerificationStatus: GstinVerificationStatus;
  billingAddress: string | null;
  postalCode: string | null;
  stateCode: string | null;
  stateName: string | null;
}

export interface EcoReportingSnapshot {
  platform: BillingPlatform | "web";
  operatorIdentifier: string | null;
  operatorGstin: string | null;
  taxResponsibilityMode: TaxResponsibilityMode;
  /** Issue-time policy copy only. Filing authority is the compliance record. */
  ecoReportingCategory: EcoReportingCategory;
}

/**
 * Immutable-per-document tax invoice / receipt.
 * Path: `_subscriptionInvoices/{invoiceId}` (zero client access).
 */
export interface SubscriptionInvoiceDoc {
  invoiceId: string;
  uid: string;
  diagnosticUid: string;
  financialEventId: string;
  platform: BillingPlatform | "web" | null;
  canonicalSku: string | null;
  plan: VyaamikkPlan | null;
  billingPeriod: string | null;
  taxResponsibilityMode: TaxResponsibilityMode;
  documentType: TaxDocumentType;
  documentNumber: string | null;
  financialYear: string | null;
  taxPeriodMonth: string | null;
  taxPeriodStatus: TaxPeriodStatus;
  invoiceIssuedAt: number | null;
  invoiceIssuedOnIst: string | null;
  supplyOccurredAt: number | null;
  issueStatus: TaxDocumentIssueStatus;
  issueHoldReason: InvoiceIssueHoldReason | null;
  reverseChargeMode: ReverseChargeMode | null;
  subscriptionDescription: string | null;
  seller: SellerTaxSnapshot | null;
  buyer: BuyerTaxSnapshot;
  placeOfSupplyStateCode: string | null;
  placeOfSupplyStateName: string | null;
  sacCode: string | null;
  serviceDescription: string | null;
  currency: "INR" | null;
  grossCustomerAmountInPaise: number | null;
  taxableAmountInPaise: number | null;
  gstRateBps: number | null;
  taxType: GstTaxType;
  cgstInPaise: number | null;
  sgstInPaise: number | null;
  igstInPaise: number | null;
  totalTaxInPaise: number | null;
  totalInPaise: number | null;
  platformCommissionInPaise: number | null;
  ecoReporting: EcoReportingSnapshot;
  pdfStatus: InvoicePdfStatus;
  invoicePdfStoragePath: string | null;
  emailStatus: InvoiceEmailStatus;
  emailProviderMessageId: string | null;
  invoiceEmailAcceptedAt: number | null;
  invoiceEmailDeliveredAt: number | null;
  gstrReportable: boolean;
  gstrReportedMonth: string | null;
  gstrFilingBatchId: string | null;
  historyEventId: string | null;
  /**
   * Operational aging hint (ordinary taxable services: 30 days from supply).
   * Pending-GSTIN / incomplete-recipient holds are NOT auto-expired against
   * this timestamp in VYD-40 — enforcement is a production-enablement gate.
   */
  invoiceIssueDueAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type Gstr1ReviewStatus = "ready_to_file" | "requires_tax_review";

export type TaxComplianceDocumentKind = "invoice" | "credit_note";

/**
 * Output-tax reduction eligibility is distinct from a store refund/chargeback
 * and from whether a statutory credit note document exists.
 */
export type GstAdjustmentEligibility =
  | "not_applicable"
  | "requires_review"
  | "eligible"
  | "ineligible"
  | "ineligible_for_output_tax_reduction";

export type GstEvidenceStatus = "not_applicable" | "unconfirmed" | "confirmed";

/**
 * Section 34 uses the earlier of 30 November following the original-supply FY
 * and the date the relevant annual return is furnished. The date is never
 * guessed: `unconfirmed` cannot become `eligible`.
 */
export type AnnualReturnCutoffStatus =
  | "not_applicable"
  | "unconfirmed"
  | "not_furnished_as_of_review"
  | "furnished";

export type TaxAdjustmentDisposition =
  | "not_applicable"
  | "pending"
  | "credit_note_issued"
  | "requires_review"
  | "ineligible";

/** Explicit Section-34 CN issuance policy. Blank/unconfirmed fails closed. */
export type Section34CreditNotePolicy = "unconfirmed" | "full_refund_developer_tax_invoice";

/**
 * Server-only GST-return / monthly-compliance record.
 * Path: `_subscriptionTaxCompliance/{invoiceId}` (invoiceId or creditNoteId).
 * Filing authority for reporting period, ECO/Table-14 category, and month close.
 * The invoice legal snapshot stays immutable after issuance.
 */
export interface SubscriptionTaxComplianceDoc {
  invoiceId: string;
  documentKind: TaxComplianceDocumentKind;
  financialEventId: string;
  originalInvoiceId: string | null;
  uid: string;
  supplyMonthKey: string;
  issueMonthKey: string | null;
  reportingTaxPeriodMonth: string | null;
  taxPeriodDecisionStatus: TaxPeriodDecisionStatus;
  ecoReportingCategory: EcoReportingCategory;
  operatorIdentifier: string | null;
  operatorGstin: string | null;
  reviewStatus: Gstr1ReviewStatus;
  unresolvedReasons: string[];
  cumulativeCreditReversedInPaise: number;
  gstAdjustmentEligibility: GstAdjustmentEligibility;
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
  section34OuterLimitAt: number | null;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
  annualReturnCutoffReviewedAt: number | null;
  annualReturnCutoffReviewBasis: string | null;
  annualReturnCutoffConfirmedThrough: number | null;
  taxAdjustmentDisposition: TaxAdjustmentDisposition;
  reviewedAt: number | null;
  reviewedByDiagnosticUid: string | null;
  reviewBasis: string | null;
  reviewVersion: number;
  previousEcoReportingCategory: EcoReportingCategory | null;
  previousReportingTaxPeriodMonth: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Always immutable, including on unissued drafts. */
export const INVOICE_IDENTITY_KEYS: ReadonlyArray<keyof SubscriptionInvoiceDoc> = [
  "invoiceId",
  "uid",
  "financialEventId",
];

/**
 * Frozen only after statutory issuance (documentNumber + invoiceIssuedAt).
 * Unissued drafts may refresh these when compliance configuration arrives.
 */
export const INVOICE_STATUTORY_KEYS: ReadonlyArray<keyof SubscriptionInvoiceDoc> = [
  "invoiceId",
  "uid",
  "diagnosticUid",
  "financialEventId",
  "platform",
  "canonicalSku",
  "plan",
  "billingPeriod",
  "subscriptionDescription",
  "taxResponsibilityMode",
  "documentType",
  "documentNumber",
  "financialYear",
  "taxPeriodMonth",
  "taxPeriodStatus",
  "invoiceIssuedAt",
  "invoiceIssuedOnIst",
  "supplyOccurredAt",
  "issueStatus",
  "issueHoldReason",
  "reverseChargeMode",
  "seller",
  "buyer",
  "placeOfSupplyStateCode",
  "placeOfSupplyStateName",
  "sacCode",
  "serviceDescription",
  "currency",
  "grossCustomerAmountInPaise",
  "taxableAmountInPaise",
  "gstRateBps",
  "taxType",
  "cgstInPaise",
  "sgstInPaise",
  "igstInPaise",
  "totalTaxInPaise",
  "totalInPaise",
  "platformCommissionInPaise",
  "ecoReporting",
];

/** @deprecated Use INVOICE_STATUTORY_KEYS; kept as alias for existing imports. */
export const INVOICE_IMMUTABLE_KEYS = INVOICE_STATUTORY_KEYS;

export const INVOICE_OPERATIONAL_KEYS: ReadonlyArray<keyof SubscriptionInvoiceDoc> = [
  "pdfStatus",
  "invoicePdfStoragePath",
  "emailStatus",
  "emailProviderMessageId",
  "invoiceEmailAcceptedAt",
  "invoiceEmailDeliveredAt",
  "gstrReportedMonth",
  "gstrFilingBatchId",
  "invoiceIssueDueAt",
  "updatedAt",
];

export interface SubscriptionBillingDetailsDoc {
  gstin: string | null;
  /** Individual recipient / billing name. Not the same as optional business name. */
  billingRecipientName: string | null;
  billingBusinessName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingPostalCode: string | null;
  billingStateCode: string | null;
  billingStateName: string | null;
  gstinVerificationStatus: GstinVerificationStatus;
  verifiedLegalName: string | null;
  verifiedStateCode: string | null;
  verifiedAt: number | null;
  verifiedByDiagnosticUid: string | null;
  updatedAt: number;
}

export interface InvoiceCounterDoc {
  currentTaxInvoiceCount: number;
  currentReceiptCount: number;
  financialYear: string;
  updatedAt: number;
}

export interface CreditNoteCounterDoc {
  currentCount: number;
  financialYear: string;
  updatedAt: number;
}

export interface SubscriptionCreditNoteDoc {
  creditNoteId: string;
  originalInvoiceId: string;
  originalDocumentNumber: string | null;
  refundFinancialEventId: string;
  uid: string;
  diagnosticUid: string;
  documentNumber: string | null;
  financialYear: string | null;
  taxPeriodMonth: string | null;
  taxPeriodStatus: TaxPeriodStatus;
  issuedAt: number | null;
  issuedOnIst: string | null;
  nature: "CREDIT NOTE";
  seller: SellerTaxSnapshot | null;
  buyer: BuyerTaxSnapshot | null;
  /** Convenience copy of buyer.gstin. Name/address live on `buyer`. */
  buyerGstin: string | null;
  buyerClassification: BuyerClassification | null;
  originalInvoiceIssuedAt: number | null;
  originalInvoiceIssuedOnIst: string | null;
  placeOfSupplyStateCode: string | null;
  placeOfSupplyStateName: string | null;
  gstRateBps: number | null;
  taxType: GstTaxType;
  taxResponsibilityMode: TaxResponsibilityMode;
  taxableAmountReversedInPaise: number | null;
  cgstReversedInPaise: number | null;
  sgstReversedInPaise: number | null;
  igstReversedInPaise: number | null;
  totalTaxReversedInPaise: number | null;
  totalReversedInPaise: number | null;
  gstAdjustmentEligibility: GstAdjustmentEligibility;
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
  section34OuterLimitAt: number | null;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
  annualReturnCutoffReviewedAt: number | null;
  annualReturnCutoffReviewBasis: string | null;
  annualReturnCutoffConfirmedThrough: number | null;
  taxAdjustmentDisposition: TaxAdjustmentDisposition;
  gstrReportable: boolean;
  gstrReportedMonth: string | null;
  gstrFilingBatchId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const CREDIT_NOTE_STATUTORY_KEYS: ReadonlyArray<keyof SubscriptionCreditNoteDoc> = [
  "creditNoteId",
  "originalInvoiceId",
  "originalDocumentNumber",
  "refundFinancialEventId",
  "uid",
  "documentNumber",
  "financialYear",
  "taxPeriodMonth",
  "issuedAt",
  "issuedOnIst",
  "nature",
  "seller",
  "buyer",
  "originalInvoiceIssuedAt",
  "originalInvoiceIssuedOnIst",
  "placeOfSupplyStateCode",
  "placeOfSupplyStateName",
  "gstRateBps",
  "taxType",
  "taxResponsibilityMode",
  "taxableAmountReversedInPaise",
  "cgstReversedInPaise",
  "sgstReversedInPaise",
  "igstReversedInPaise",
  "totalTaxReversedInPaise",
  "totalReversedInPaise",
];

export type InvoiceRetryStage = "pdf" | "email";

export interface InvoiceRetryStageState {
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number | null;
  lastErrorCode: string | null;
  deadLettered: boolean;
  resolved: boolean;
}

export interface InvoiceRetryQueueDoc {
  invoiceId: string;
  financialEventId: string;
  pdf: InvoiceRetryStageState;
  email: InvoiceRetryStageState;
  updatedAt: number;
}

export interface Gstr1ReportManifestDoc {
  reportId: string;
  month: string;
  invoiceIds: string[];
  creditNoteIds: string[];
  sourceInvoiceIds: string[];
  sourceCreditNoteIds: string[];
  sourceComplianceIds: string[];
  sourceFinancialEventIds: string[];
  contentHash: string;
  jsonStoragePath: string;
  csvStoragePath: string;
  generatedAt: number;
  generatedByDiagnosticUid: string;
  reviewStatus: Gstr1ReviewStatus;
  unresolvedReviewReasons: string[];
}

export interface Gstr1FilingBatchDoc {
  month: string;
  reportId: string;
  invoiceIds: string[];
  creditNoteIds: string[];
  reportHash: string;
  filedAt: number;
  filedByDiagnosticUid: string;
  filingAcknowledgementReference: string;
  createdAt: number;
}
