/**
 * App Store subscription adapter (VYD-33).
 *
 * Terminates at VerifiedPlatformEvent / VerifiedFinancialEvent /
 * CanonicalTransition and then calls applySubscriptionTransition.
 * Raw Apple JWS never enters the Phase-B engine and is never persisted.
 *
 * Client JWS / ASSN notificationType are signals only. Current entitlement
 * comes from Get All Subscription Statuses after SignedDataVerifier checks.
 */

import {
  AutoRenewStatus,
  InAppOwnershipType,
  NotificationTypeV2,
  RevocationType,
  TransactionReason,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";

import {
  applySubscriptionTransition,
  type ApplyTransitionResult,
} from "../applyTransition";
import { BillingError } from "../errors";
import { billingLog } from "../log";
import {
  billingReconciliationQueuePath,
  financialLedgerPath,
  sanitizeDocId,
  subscriptionStatusPath,
} from "../paths";
import { canonicalSkuForIos, getCatalogEntry, isCanonicalSku, type CanonicalSku } from "../products";
import { ignoredIosAssnAction } from "./appleAssnScope";
import { assertIosBillingPlanSupported, iosBillingPlanSemanticKey } from "./appleBillingPlan";
import {
  ensureAppStoreFinancialReview,
  iosFullRefundMissingSaleReviewId,
  iosInvalidRevocationPercentageReviewId,
  iosProratedRefundReviewId,
  iosRefundReversedReviewId,
  iosUnsupportedRevocationReviewId,
  markAppStoreFinancialReviewEntitlementReconciled,
  readAppStoreFinancialReview,
} from "./appleFinancialReview";
import { iosMonetaryRefundPercentageDisposition } from "./appleRefundPercentage";
import { assertIosStoreOfferUnsupported } from "./appleStoreOffer";
import {
  ensureReconciliationWorkItem,
  IOS_CALLABLE_RECONCILIATION_INCIDENT,
  iosStatusReconciliationQueueId,
  resolveReconciliationWorkItem,
  type IosStatusReconciliationIncident,
} from "../reconciliationQueue";
import type { BillingStore } from "../store";
import {
  financialEventIdForStore,
  type CanonicalTransitionKind,
  type TransitionRequest,
  type VerifiedFinancialEvent,
  type VerifiedPlatformEvent,
} from "../transition";
import type {
  BillingEventLedgerDoc,
  BillingMutationSource,
  BillingReconciliationQueueDoc,
  CompanyBillingDoc,
  SubscriptionStatusDoc,
  VyaamikkPlan,
} from "../types";
import type { AppleSubscriptionApi } from "./appleApiClient";
import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";
import { assertSignedJws } from "./appleJws";
import {
  iosLifecycleIdempotencyKey,
  iosLifecycleSnapshotHash,
} from "./appleLifecycle";
import { APPLE_PLATFORM_COMMISSION_IN_PAISE, appleMilliunitsToPaise } from "./appleMoney";
import {
  assertIosOwnerMatchesCaller,
  resolveUidFromAppAccountToken,
} from "./appleOwnership";
import { mapAppleSubscriptionStatus } from "./appleStatusMap";
import type { AppleSignedDataVerifier } from "./appleVerifier";

export type PostCommitTaxHandoff = (input: {
  uid: string;
  financialEventId: string;
  eventType: "purchase" | "renewal" | "refund";
  grossAmountInPaise: number;
  canonicalSku: string;
  alreadyProcessed: boolean;
  financialEventWritten: boolean;
}) => Promise<void>;

export interface IosBillingDeps {
  store: BillingStore;
  verifier: AppleSignedDataVerifier;
  api: AppleSubscriptionApi;
  diagnosticUidFor: (uid: string) => string;
  nowMs: () => number;
  postCommitTaxHandoff?: PostCommitTaxHandoff;
}

export interface IosBillingResult {
  alreadyProcessed: boolean;
  financialEventWritten: boolean;
  historyWritten: boolean;
  skipped: string | null;
  uid: string;
  diagnosticUid: string;
  resultSummary: string;
  to: SubscriptionStatusDoc | null;
  canonicalSku: CanonicalSku | null;
  appleStatus: string | null;
  reconciliationRequired: boolean;
}

export interface IosRefundAdjustmentResult {
  written: boolean;
  financial: VerifiedFinancialEvent | null;
  uid: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
  reviewId: string | null;
  queueFinancialEventId: string | null;
}

interface VerifiedIosCurrent {
  uid: string;
  status: number;
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload;
}

const DURABLE_IOS_FINANCIAL_EVENT_ID = /^ios:(purchase|renewal|refund):.+$/;

function requireText(value: unknown, causeCode: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BillingError({ clientCode: "verification_failed", causeCode });
  }
  return value;
}

function requireFiniteMillis(value: unknown, causeCode: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BillingError({ clientCode: "verification_failed", causeCode });
  }
  return value;
}

function optionalFiniteMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "invalid_ios_timestamp",
    });
  }
  return value;
}

async function readStatus(
  store: BillingStore,
  uid: string
): Promise<SubscriptionStatusDoc | null> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(subscriptionStatusPath(uid));
    if (!snap.exists) return null;
    return snap.data() as unknown as SubscriptionStatusDoc;
  });
}

async function readLedger(
  store: BillingStore,
  financialEventId: string
): Promise<BillingEventLedgerDoc | null> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(financialLedgerPath(sanitizeDocId(financialEventId)));
    if (!snap.exists) return null;
    return snap.data() as unknown as BillingEventLedgerDoc;
  });
}

function isIdempotentApplyCollision(err: unknown): boolean {
  return (
    err instanceof BillingError &&
    (err.causeCode === "idempotency_conflict" || err.causeCode === "append_only_collision")
  );
}

function isRetryableBillingError(err: unknown): boolean {
  return err instanceof BillingError && err.retryable === true;
}

function financialReplayMatches(
  existing: BillingEventLedgerDoc,
  expected: VerifiedFinancialEvent,
  uid: string
): boolean {
  return (
    existing.uid === uid &&
    existing.platform === expected.platform &&
    existing.eventType === expected.eventType &&
    existing.canonicalSku === expected.canonicalSku &&
    existing.grossAmountInPaise === expected.grossAmountInPaise &&
    (existing.relatedFinancialEventId ?? null) === (expected.relatedFinancialEventId ?? null) &&
    existing.occurredAt === expected.occurredAt
  );
}

function lifecycleAlreadyMatches(
  status: SubscriptionStatusDoc | null,
  opts: {
    kind: CanonicalTransitionKind;
    plan: VyaamikkPlan;
    platformEvent: VerifiedPlatformEvent;
    gracePeriodEndsAt?: number;
  }
): boolean {
  if (!status) return false;
  const ev = opts.platformEvent;
  const samePlatform = (nextStatus: SubscriptionStatusDoc["billingStatus"]): boolean =>
    status.billingStatus === nextStatus &&
    status.plan === opts.plan &&
    status.platform === ev.platform &&
    status.productId === ev.productId &&
    (status.basePlanId ?? null) === (ev.basePlanId ?? null) &&
    status.currentPeriodStart === ev.currentPeriodStart &&
    status.currentPeriodEnd === ev.currentPeriodEnd &&
    status.autoRenewing === ev.autoRenewing;
  if (opts.kind === "expire") return status.billingStatus === "expired";
  if (opts.kind === "activatePaid" || opts.kind === "renew") {
    return samePlatform("active") && status.cancelledAt == null && status.gracePeriodEndsAt == null;
  }
  if (opts.kind === "enterGrace") {
    return samePlatform("grace") && status.gracePeriodEndsAt === opts.gracePeriodEndsAt;
  }
  if (opts.kind === "enterOnHold") {
    return samePlatform("onHold");
  }
  if (opts.kind === "cancel") {
    return samePlatform("cancelled");
  }
  return false;
}

async function applyTransitionIdempotent(
  deps: IosBillingDeps,
  diagnosticUid: string,
  req: TransitionRequest,
  expectedFinancial?: VerifiedFinancialEvent
): Promise<ApplyTransitionResult> {
  try {
    return await applySubscriptionTransition({ store: deps.store, diagnosticUid }, req);
  } catch (err) {
    if (!isIdempotentApplyCollision(err)) throw err;
    if (expectedFinancial) {
      const existing = await readLedger(deps.store, expectedFinancial.financialEventId);
      if (!existing || !financialReplayMatches(existing, expectedFinancial, req.uid)) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "financial_event_conflict",
        });
      }
      const prior = await readStatus(deps.store, req.uid);
      if (!prior) throw err;
      return {
        alreadyProcessed: true,
        diagnosticUid,
        from: prior,
        to: prior,
        financialEventWritten: false,
        historyWritten: false,
        resultSummary: `${prior.billingStatus}:${prior.plan}:${prior.entitlementActive ? "1" : "0"}`,
      };
    }
    const prior = await readStatus(deps.store, req.uid);
    if (!prior) throw err;
    return {
      alreadyProcessed: true,
      diagnosticUid,
      from: prior,
      to: prior,
      financialEventWritten: false,
      historyWritten: false,
      resultSummary: `${prior.billingStatus}:${prior.plan}:${prior.entitlementActive ? "1" : "0"}`,
    };
  }
}

async function invokeTaxHandoff(
  deps: IosBillingDeps,
  uid: string,
  financial: VerifiedFinancialEvent,
  applyResult: ApplyTransitionResult
): Promise<void> {
  // Production exports omit postCommitTaxHandoff until
  // APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED. Injected tests may
  // pass a callback to prove adapter wiring; that path is not a live tax issue.
  if (!deps.postCommitTaxHandoff) return;
  if (
    financial.eventType !== "purchase" &&
    financial.eventType !== "renewal" &&
    financial.eventType !== "refund"
  ) {
    return;
  }
  await deps.postCommitTaxHandoff({
    uid,
    financialEventId: financial.financialEventId,
    eventType: financial.eventType,
    grossAmountInPaise: financial.grossAmountInPaise,
    canonicalSku: financial.canonicalSku,
    alreadyProcessed: applyResult.alreadyProcessed,
    financialEventWritten: applyResult.financialEventWritten,
  });
}

export async function assertVerifiedIosTransactionPointer(
  verifier: AppleSignedDataVerifier,
  signedTransactionInfo: unknown
): Promise<JWSTransactionDecodedPayload> {
  const jws = assertSignedJws(signedTransactionInfo, "invalid_signed_transaction_info");
  const tx = await verifier.verifyAndDecodeTransaction(jws);
  if (tx.bundleId !== CANONICAL_IOS_BUNDLE_ID) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "apple_app_identifier_mismatch",
    });
  }
  if (tx.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_product_type_not_auto_renewable",
    });
  }
  requireText(tx.transactionId, "missing_ios_transaction_id");
  requireText(tx.originalTransactionId, "missing_ios_original_transaction_id");
  const productId = requireText(tx.productId, "unknown_ios_product");
  if (canonicalSkuForIos(productId) == null) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_ios_product",
    });
  }
  if (tx.inAppOwnershipType !== InAppOwnershipType.PURCHASED) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_family_sharing_not_supported",
    });
  }
  if (tx.appAccountToken == null || tx.appAccountToken === "") {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_app_account_token",
    });
  }
  assertIosBillingPlanSupported(tx);
  assertIosStoreOfferUnsupported(tx);
  return tx;
}

function nullish(value: unknown): unknown {
  return value == null ? null : value;
}

/**
 * Semantic identity of a verified current-subscription candidate.
 * Any field that can change ownership, economics, period, grace, revocation,
 * lifecycle identity, or store-price evidence must match.
 */
function iosCurrentSemanticKey(c: VerifiedIosCurrent): string {
  return JSON.stringify({
    uid: c.uid,
    status: c.status,
    transaction: {
      transactionId: nullish(c.transaction.transactionId),
      originalTransactionId: nullish(c.transaction.originalTransactionId),
      productId: nullish(c.transaction.productId),
      appAccountToken: nullish(c.transaction.appAccountToken),
      transactionReason: nullish(c.transaction.transactionReason),
      purchaseDate: nullish(c.transaction.purchaseDate),
      expiresDate: nullish(c.transaction.expiresDate),
      revocationDate: nullish(c.transaction.revocationDate),
      revocationType: nullish(c.transaction.revocationType),
      revocationPercentage: nullish(c.transaction.revocationPercentage),
      inAppOwnershipType: nullish(c.transaction.inAppOwnershipType),
      price: nullish(c.transaction.price),
      currency: nullish(c.transaction.currency),
    },
    billingPlan: iosBillingPlanSemanticKey(c.transaction, c.renewal),
    renewal: {
      originalTransactionId: nullish(c.renewal.originalTransactionId),
      appAccountToken: nullish(c.renewal.appAccountToken),
      productId: nullish(c.renewal.productId),
      autoRenewProductId: nullish(c.renewal.autoRenewProductId),
      autoRenewStatus: nullish(c.renewal.autoRenewStatus),
      gracePeriodExpiresDate: nullish(c.renewal.gracePeriodExpiresDate),
      signedDate: nullish(c.renewal.signedDate),
    },
  });
}

function currentStatesEquivalent(a: VerifiedIosCurrent, b: VerifiedIosCurrent): boolean {
  return iosCurrentSemanticKey(a) === iosCurrentSemanticKey(b);
}

function assertExpectedCanonicalSkuHint(
  expectedCanonicalSku: unknown,
  verified: CanonicalSku
): void {
  if (expectedCanonicalSku == null) return;
  if (typeof expectedCanonicalSku !== "string" || !isCanonicalSku(expectedCanonicalSku)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "invalid_sku_hint",
    });
  }
  if (expectedCanonicalSku !== verified) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "sku_hint_mismatch",
    });
  }
}

function assertDurableIosFinancialEventId(financialEventId: string): string {
  if (!DURABLE_IOS_FINANCIAL_EVENT_ID.test(financialEventId) || financialEventId.includes(":review:")) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_reconciliation_financial_event_id",
    });
  }
  return financialEventId;
}

async function assertIosRenewalBoundToTransaction(opts: {
  store: BillingStore;
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload;
  originalTransactionId: string;
  expectedUid: string;
}): Promise<void> {
  const txOrig = requireText(
    opts.transaction.originalTransactionId,
    "missing_ios_original_transaction_id"
  );
  const renewalOrig = requireText(
    opts.renewal.originalTransactionId,
    "ios_renewal_original_transaction_mismatch"
  );
  if (txOrig !== opts.originalTransactionId || renewalOrig !== opts.originalTransactionId) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_renewal_original_transaction_mismatch",
    });
  }
  const txToken = requireText(opts.transaction.appAccountToken, "missing_ios_app_account_token");
  if (opts.renewal.appAccountToken != null && opts.renewal.appAccountToken !== "") {
    if (opts.renewal.appAccountToken !== txToken) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "ios_renewal_account_token_mismatch",
      });
    }
    const renewalUid = await resolveUidFromAppAccountToken(opts.store, opts.renewal.appAccountToken);
    assertIosOwnerMatchesCaller(renewalUid, opts.expectedUid);
  }
  if (
    typeof opts.renewal.productId === "string" &&
    opts.renewal.productId.length > 0 &&
    opts.renewal.productId !== opts.transaction.productId
  ) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_renewal_transaction_mismatch",
    });
  }
}

export async function selectCurrentIosSubscription(opts: {
  verifier: AppleSignedDataVerifier;
  store: BillingStore;
  statuses: StatusResponse;
  originalTransactionId: string;
  expectedUid: string;
}): Promise<VerifiedIosCurrent> {
  const candidates: VerifiedIosCurrent[] = [];
  for (const group of opts.statuses.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (item.originalTransactionId !== opts.originalTransactionId) continue;
      if (!item.signedTransactionInfo || !item.signedRenewalInfo) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "missing_ios_signed_subscription_pair",
        });
      }
      const transaction = await opts.verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
      const renewal = await opts.verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
      if (transaction.originalTransactionId !== opts.originalTransactionId) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "ios_status_transaction_chain_mismatch",
        });
      }
      if (transaction.bundleId !== CANONICAL_IOS_BUNDLE_ID) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "apple_app_identifier_mismatch",
        });
      }
      if (transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "ios_status_product_type_mismatch",
        });
      }
      if (transaction.inAppOwnershipType !== InAppOwnershipType.PURCHASED) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "ios_family_sharing_not_supported",
        });
      }
      const productId = requireText(transaction.productId, "unknown_ios_product");
      if (canonicalSkuForIos(productId) == null) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "unknown_ios_product",
        });
      }
      if (transaction.appAccountToken == null || transaction.appAccountToken === "") {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "missing_ios_app_account_token",
        });
      }
      const uid = await resolveUidFromAppAccountToken(opts.store, transaction.appAccountToken);
      assertIosOwnerMatchesCaller(uid, opts.expectedUid);
      await assertIosRenewalBoundToTransaction({
        store: opts.store,
        transaction,
        renewal,
        originalTransactionId: opts.originalTransactionId,
        expectedUid: opts.expectedUid,
      });
      assertIosBillingPlanSupported(transaction, renewal);
      assertIosStoreOfferUnsupported(transaction, renewal);
      if (item.status == null) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "unknown_ios_subscription_status",
        });
      }
      candidates.push({ uid, status: item.status, transaction, renewal });
    }
  }
  if (candidates.length === 0) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "no_current_ios_subscription",
    });
  }
  const first = candidates[0];
  for (const other of candidates.slice(1)) {
    if (!currentStatesEquivalent(first, other)) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "ambiguous_ios_subscription_state",
      });
    }
  }
  return first;
}

function assertNoScheduledPlanChange(
  transaction: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload
): void {
  const current = transaction.productId;
  const next = renewal.autoRenewProductId;
  if (typeof next === "string" && next.length > 0 && next !== current) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unsupported_ios_scheduled_plan_change",
    });
  }
}

function economicEventType(reason: unknown): "purchase" | "renewal" {
  if (reason === TransactionReason.PURCHASE) return "purchase";
  if (reason === TransactionReason.RENEWAL) return "renewal";
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_ios_transaction_reason",
  });
}

function buildPlatformEvent(opts: {
  canonicalSku: CanonicalSku;
  productId: string;
  transaction: JWSTransactionDecodedPayload;
  autoRenewing: boolean;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  reconciledAt: number;
}): VerifiedPlatformEvent {
  return {
    platform: "ios",
    canonicalSku: opts.canonicalSku,
    productId: opts.productId,
    basePlanId: null,
    currentPeriodStart: opts.currentPeriodStart,
    currentPeriodEnd: opts.currentPeriodEnd,
    autoRenewing: opts.autoRenewing,
    latestOrderId: requireText(opts.transaction.transactionId, "missing_ios_transaction_id"),
    originalTransactionId: requireText(
      opts.transaction.originalTransactionId,
      "missing_ios_original_transaction_id"
    ),
    credentialFingerprint: null,
    encryptedPurchaseCredential: null,
    reconciledAt: opts.reconciledAt,
  };
}

function buildPurchaseOrRenewalFinancial(
  transaction: JWSTransactionDecodedPayload,
  canonicalSku: CanonicalSku
): VerifiedFinancialEvent {
  const eventType = economicEventType(transaction.transactionReason);
  const transactionId = requireText(transaction.transactionId, "missing_ios_transaction_id");
  const occurredAt = requireFiniteMillis(transaction.purchaseDate, "missing_ios_purchase_date");
  // Verified JWS store-transaction price evidence only — not accounting SoR.
  const grossAmountInPaise = appleMilliunitsToPaise({
    price: transaction.price,
    currency: transaction.currency,
  });
  return {
    financialEventId: financialEventIdForStore({
      platform: "ios",
      eventType,
      transactionId,
    }),
    eventType,
    platform: "ios",
    canonicalSku,
    grossAmountInPaise,
    actualPlatformCommissionInPaise: APPLE_PLATFORM_COMMISSION_IN_PAISE,
    estimatedPlatformCommissionInPaise: null,
    occurredAt,
    relatedFinancialEventId: null,
  };
}

async function enqueueStatusReconciliation(
  deps: IosBillingDeps,
  originalTransactionId: string,
  financialEventId: string,
  reason: string,
  incident: IosStatusReconciliationIncident
): Promise<void> {
  const durableId = assertDurableIosFinancialEventId(financialEventId);
  await ensureReconciliationWorkItem(deps.store, {
    id: iosStatusReconciliationQueueId(originalTransactionId, durableId, incident),
    reason,
    platform: "ios",
    financialEventId: durableId,
    credentialFingerprint: null,
    nowMs: deps.nowMs(),
  });
}

async function readIosStatusReconciliationQueue(
  store: BillingStore,
  originalTransactionId: string,
  financialEventId: string,
  incident: IosStatusReconciliationIncident
): Promise<BillingReconciliationQueueDoc | null> {
  const id = iosStatusReconciliationQueueId(originalTransactionId, financialEventId, incident);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(billingReconciliationQueuePath(sanitizeDocId(id)));
    if (!snap.exists) return null;
    return snap.data() as unknown as BillingReconciliationQueueDoc;
  });
}

function isDurableIosLedgerEventType(
  eventType: BillingEventLedgerDoc["eventType"]
): eventType is "purchase" | "renewal" | "refund" {
  return eventType === "purchase" || eventType === "renewal" || eventType === "refund";
}

function isIosSaleEventType(
  eventType: BillingEventLedgerDoc["eventType"]
): eventType is "purchase" | "renewal" {
  return eventType === "purchase" || eventType === "renewal";
}

/**
 * Resolve the iOS status-reconciliation work item for ONE durable financial
 * event. Missing item is a no-op. Never infers a different event from the
 * current live sale.
 */
async function resolveIosStatusReconciliationIfPresent(
  store: BillingStore,
  originalTransactionId: string,
  financialEventId: string | null | undefined,
  expectedUid: string,
  nowMs: number,
  incident: IosStatusReconciliationIncident
): Promise<void> {
  if (financialEventId == null || financialEventId === "") return;
  const durableId = assertDurableIosFinancialEventId(financialEventId);
  const queue = await readIosStatusReconciliationQueue(
    store,
    originalTransactionId,
    durableId,
    incident
  );
  if (!queue) return;
  if (queue.platform !== "ios" || queue.financialEventId !== durableId) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "reconciliation_queue_identity_mismatch",
    });
  }
  const ledger = await readLedger(store, durableId);
  if (!ledger || ledger.platform !== "ios" || !isDurableIosLedgerEventType(ledger.eventType)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_reconciliation_queue_integrity_mismatch",
    });
  }
  if (ledger.uid !== expectedUid) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_reconciliation_queue_owner_mismatch",
    });
  }
  await resolveReconciliationWorkItem(store, {
    id: iosStatusReconciliationQueueId(originalTransactionId, durableId, incident),
    platform: "ios",
    financialEventId: durableId,
    nowMs,
  });
}

export async function reconcileIosOriginalTransaction(
  deps: IosBillingDeps,
  input: {
    originalTransactionId: string;
    expectedUid: string;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    observationTime: number;
    expectedCanonicalSku?: unknown;
  }
): Promise<IosBillingResult> {
  const diagnosticUid = deps.diagnosticUidFor(input.expectedUid);
  const reconciledAt = deps.nowMs();
  let statuses: StatusResponse;
  try {
    statuses = await deps.api.getAllSubscriptionStatuses(input.originalTransactionId);
  } catch (err) {
    if (isRetryableBillingError(err)) throw err;
    throw err;
  }

  const current = await selectCurrentIosSubscription({
    verifier: deps.verifier,
    store: deps.store,
    statuses,
    originalTransactionId: input.originalTransactionId,
    expectedUid: input.expectedUid,
  });
  assertNoScheduledPlanChange(current.transaction, current.renewal);

  const productId = requireText(current.transaction.productId, "unknown_ios_product");
  const canonicalSku = canonicalSkuForIos(productId);
  if (canonicalSku == null) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_ios_product",
    });
  }
  assertExpectedCanonicalSkuHint(input.expectedCanonicalSku, canonicalSku);
  const catalog = getCatalogEntry(canonicalSku);
  const plan = catalog.plan;
  const mapped = mapAppleSubscriptionStatus({
    status: current.status,
    autoRenewStatus: current.renewal.autoRenewStatus,
  });
  const currentPeriodStart = requireFiniteMillis(
    current.transaction.purchaseDate,
    "missing_ios_purchase_date"
  );
  const currentPeriodEnd = requireFiniteMillis(
    current.transaction.expiresDate,
    "missing_ios_expires_date"
  );
  const platformEvent = buildPlatformEvent({
    canonicalSku,
    productId,
    transaction: current.transaction,
    autoRenewing: mapped.autoRenewing,
    currentPeriodStart,
    currentPeriodEnd,
    reconciledAt,
  });
  const financial = buildPurchaseOrRenewalFinancial(current.transaction, canonicalSku);

  let financialEventWritten = false;
  let historyWritten = false;
  let alreadyProcessed = true;
  let to: SubscriptionStatusDoc | null = await readStatus(deps.store, current.uid);
  let lastSummary = to
    ? `${to.billingStatus}:${to.plan}:${to.entitlementActive ? "1" : "0"}`
    : "noop";

  const existingEconomic = await readLedger(deps.store, financial.financialEventId);
  if (!existingEconomic) {
    const economicKind: CanonicalTransitionKind =
      financial.eventType === "renewal" ? "renew" : "activatePaid";
    const applied = await applyTransitionIdempotent(
      deps,
      diagnosticUid,
      {
        uid: current.uid,
        source: input.source,
        eventSource: input.eventSource,
        idempotencyKey: financial.financialEventId,
        occurredAt: financial.occurredAt,
        nowMs: reconciledAt,
        requested: {
          kind: economicKind,
          plan,
          platformEvent,
          financialEvent: financial,
        },
      },
      financial
    );
    financialEventWritten = applied.financialEventWritten || financialEventWritten;
    historyWritten = applied.historyWritten || historyWritten;
    alreadyProcessed = alreadyProcessed && applied.alreadyProcessed;
    to = applied.to;
    lastSummary = applied.resultSummary;
    await invokeTaxHandoff(deps, current.uid, financial, applied);
  } else if (!financialReplayMatches(existingEconomic, financial, current.uid)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_conflict",
    });
  }

  if (
    !lifecycleAlreadyMatches(to, {
      kind: mapped.kind,
      plan,
      platformEvent,
      gracePeriodEndsAt:
        mapped.kind === "enterGrace"
          ? (optionalFiniteMillis(current.renewal.gracePeriodExpiresDate) ?? currentPeriodEnd)
          : undefined,
    })
  ) {
    const snapshotHash = iosLifecycleSnapshotHash({
      transactionId: requireText(current.transaction.transactionId, "missing_ios_transaction_id"),
      originalTransactionId: input.originalTransactionId,
      productId,
      status: current.status,
      autoRenewStatus:
        typeof current.renewal.autoRenewStatus === "number"
          ? current.renewal.autoRenewStatus
          : AutoRenewStatus.OFF,
      expiresDate: currentPeriodEnd,
      gracePeriodExpiresDate: optionalFiniteMillis(current.renewal.gracePeriodExpiresDate),
      revocationDate: optionalFiniteMillis(current.transaction.revocationDate),
      renewalSignedDate: optionalFiniteMillis(current.renewal.signedDate),
    });
    const lifecycleKey = iosLifecycleIdempotencyKey(mapped.statusLabel, snapshotHash);
    const gracePeriodEndsAt =
      mapped.kind === "enterGrace"
        ? (optionalFiniteMillis(current.renewal.gracePeriodExpiresDate) ?? currentPeriodEnd)
        : undefined;
    const applied = await applyTransitionIdempotent(deps, diagnosticUid, {
      uid: current.uid,
      source: input.source,
      eventSource: input.eventSource,
      idempotencyKey: lifecycleKey,
      occurredAt: mapped.kind === "cancel" ? input.observationTime : reconciledAt,
      nowMs: reconciledAt,
      requested: {
        kind: mapped.kind,
        plan,
        platformEvent,
        cancelledAt: mapped.kind === "cancel" ? input.observationTime : undefined,
        gracePeriodEndsAt,
        accessRevoked: mapped.statusLabel === "REVOKED",
      },
    });
    historyWritten = applied.historyWritten || historyWritten;
    alreadyProcessed = alreadyProcessed && applied.alreadyProcessed;
    to = applied.to;
    lastSummary = applied.resultSummary;
  }

  billingLog("info", {
    diagnosticUid,
    source: input.source,
    platform: "ios",
    result: lastSummary,
    canonicalSku,
    causeCode: mapped.statusLabel,
  });

  return {
    alreadyProcessed,
    financialEventWritten,
    historyWritten,
    skipped: null,
    uid: current.uid,
    diagnosticUid,
    resultSummary: lastSummary,
    to,
    canonicalSku,
    appleStatus: mapped.statusLabel,
    reconciliationRequired: false,
  };
}

export async function processIosSignedTransaction(
  deps: IosBillingDeps,
  input: {
    signedTransactionInfo: unknown;
    callerUid: string;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    expectedCanonicalSku?: unknown;
  }
): Promise<IosBillingResult> {
  const pointer = await assertVerifiedIosTransactionPointer(
    deps.verifier,
    input.signedTransactionInfo
  );
  const token = requireText(pointer.appAccountToken, "missing_ios_app_account_token");
  const ownerUid = await resolveUidFromAppAccountToken(deps.store, token);
  assertIosOwnerMatchesCaller(ownerUid, input.callerUid);
  const originalTransactionId = requireText(
    pointer.originalTransactionId,
    "missing_ios_original_transaction_id"
  );
  try {
    const result = await reconcileIosOriginalTransaction(deps, {
      originalTransactionId,
      expectedUid: ownerUid,
      source: input.source,
      eventSource: input.eventSource,
      observationTime: deps.nowMs(),
      expectedCanonicalSku: input.expectedCanonicalSku,
    });
    const txId = requireText(pointer.transactionId, "missing_ios_transaction_id");
    let pointerFinancialEventId: string | null = null;
    try {
      const eventType = economicEventType(pointer.transactionReason);
      pointerFinancialEventId = financialEventIdForStore({
        platform: "ios",
        eventType,
        transactionId: txId,
      });
    } catch (err) {
      if (!(err instanceof BillingError && err.causeCode === "unknown_ios_transaction_reason")) {
        throw err;
      }
    }
    if (pointerFinancialEventId) {
      const existing = await readLedger(deps.store, pointerFinancialEventId);
      await resolveIosStatusReconciliationIfPresent(
        deps.store,
        originalTransactionId,
        existing?.financialEventId ?? null,
        ownerUid,
        deps.nowMs(),
        IOS_CALLABLE_RECONCILIATION_INCIDENT
      );
    }
    return result;
  } catch (err) {
    if (isRetryableBillingError(err)) {
      const txId = requireText(pointer.transactionId, "missing_ios_transaction_id");
      const eventType = economicEventType(pointer.transactionReason);
      const financialEventId = financialEventIdForStore({
        platform: "ios",
        eventType,
        transactionId: txId,
      });
      const existing = await readLedger(deps.store, financialEventId);
      if (existing) {
        await enqueueStatusReconciliation(
          deps,
          originalTransactionId,
          existing.financialEventId,
          "ios_live_status_unavailable",
          IOS_CALLABLE_RECONCILIATION_INCIDENT
        );
      }
    }
    throw err;
  }
}

async function locateOriginalIosSale(
  store: BillingStore,
  transactionId: string
): Promise<BillingEventLedgerDoc> {
  const purchaseId = financialEventIdForStore({
    platform: "ios",
    eventType: "purchase",
    transactionId,
  });
  const renewalId = financialEventIdForStore({
    platform: "ios",
    eventType: "renewal",
    transactionId,
  });
  const purchase = await readLedger(store, purchaseId);
  const renewal = await readLedger(store, renewalId);
  if (purchase && renewal) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "purchase_renewal_classification_conflict",
    });
  }
  const original = purchase ?? renewal;
  if (!original) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_original_sale",
    });
  }
  return original;
}

async function locateOriginalIosSaleIfPresent(
  store: BillingStore,
  transactionId: string
): Promise<BillingEventLedgerDoc | null> {
  try {
    return await locateOriginalIosSale(store, transactionId);
  } catch (err) {
    if (err instanceof BillingError && err.causeCode === "missing_ios_original_sale") {
      return null;
    }
    throw err;
  }
}

async function resolveVerifiedRefundOwner(
  store: BillingStore,
  transaction: JWSTransactionDecodedPayload,
  expectedUid: string
): Promise<string> {
  const token = requireText(transaction.appAccountToken, "missing_ios_app_account_token");
  const resolvedUid = await resolveUidFromAppAccountToken(store, token);
  assertIosOwnerMatchesCaller(resolvedUid, expectedUid);
  return resolvedUid;
}

function iosRefundLedgerIntegrityError(): BillingError {
  return new BillingError({
    clientCode: "internal_error",
    causeCode: "ios_refund_ledger_integrity_mismatch",
  });
}

async function verifiedOriginalSaleFinancialEventIdIfPresent(
  store: BillingStore,
  transactionId: string,
  verifiedUid: string,
  verifiedCanonicalSku: CanonicalSku | null
): Promise<string | null> {
  const original = await locateOriginalIosSaleIfPresent(store, transactionId);
  if (!original) return null;
  if (original.uid !== verifiedUid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_refund_owner_mismatch",
    });
  }
  if (original.platform !== "ios" || !isIosSaleEventType(original.eventType)) {
    throw iosRefundLedgerIntegrityError();
  }
  if (verifiedCanonicalSku != null && original.canonicalSku !== verifiedCanonicalSku) {
    throw iosRefundLedgerIntegrityError();
  }
  return original.financialEventId;
}

/**
 * Bind a real `ios:refund:{transactionId}` ledger row only after verifying
 * platform, type, owner, SKU, and the related original purchase/renewal row.
 * Missing refund row → null (do not invent).
 */
async function verifiedRefundFinancialEventIdIfPresent(
  store: BillingStore,
  transactionId: string,
  verifiedUid: string,
  verifiedCanonicalSku: CanonicalSku | null
): Promise<string | null> {
  const refundId = financialEventIdForStore({
    platform: "ios",
    eventType: "refund",
    transactionId,
  });
  const refundLedger = await readLedger(store, refundId);
  if (!refundLedger) return null;
  if (
    refundLedger.platform !== "ios" ||
    refundLedger.eventType !== "refund" ||
    refundLedger.uid !== verifiedUid
  ) {
    throw iosRefundLedgerIntegrityError();
  }
  if (verifiedCanonicalSku != null && refundLedger.canonicalSku !== verifiedCanonicalSku) {
    throw iosRefundLedgerIntegrityError();
  }
  if (refundLedger.relatedFinancialEventId == null || refundLedger.relatedFinancialEventId === "") {
    throw iosRefundLedgerIntegrityError();
  }
  const original = await readLedger(store, refundLedger.relatedFinancialEventId);
  if (
    !original ||
    original.platform !== "ios" ||
    !isIosSaleEventType(original.eventType) ||
    original.uid !== verifiedUid ||
    original.canonicalSku !== refundLedger.canonicalSku
  ) {
    throw iosRefundLedgerIntegrityError();
  }
  return refundLedger.financialEventId;
}

async function persistUnsupportedIosRefundReview(opts: {
  deps: IosBillingDeps;
  reviewId: string;
  reason:
    | "unsupported_ios_prorated_refund"
    | "ios_full_refund_original_sale_missing"
    | "unsupported_ios_revocation_type"
    | "invalid_ios_revocation_percentage";
  transaction: JWSTransactionDecodedPayload;
  resolvedUid: string;
  financialEventId?: string | null;
}): Promise<{ reviewId: string; queueFinancialEventId: string | null }> {
  const transactionId = requireText(opts.transaction.transactionId, "missing_ios_transaction_id");
  const originalTransactionId = requireText(
    opts.transaction.originalTransactionId,
    "missing_ios_original_transaction_id"
  );
  const productId = requireText(opts.transaction.productId, "unknown_ios_product");
  const canonicalSku = canonicalSkuForIos(productId);
  const queueFinancialEventId =
    opts.financialEventId !== undefined
      ? opts.financialEventId
      : await verifiedOriginalSaleFinancialEventIdIfPresent(
          opts.deps.store,
          transactionId,
          opts.resolvedUid,
          canonicalSku
        );
  await ensureAppStoreFinancialReview(opts.deps.store, {
    id: opts.reviewId,
    reason: opts.reason,
    transactionId,
    originalTransactionId,
    canonicalSku,
    financialEventId: queueFinancialEventId,
    uid: opts.resolvedUid,
    diagnosticUid: opts.deps.diagnosticUidFor(opts.resolvedUid),
    nowMs: opts.deps.nowMs(),
  });
  return { reviewId: opts.reviewId, queueFinancialEventId };
}

export async function recordIosRefundAdjustment(
  deps: IosBillingDeps,
  input: {
    transaction: JWSTransactionDecodedPayload;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    expectedUid: string;
  }
): Promise<IosRefundAdjustmentResult> {
  if (input.transaction.revocationDate == null && input.transaction.revocationType == null) {
    return {
      written: false,
      financial: null,
      uid: null,
      reviewRequired: false,
      reviewReason: null,
      reviewId: null,
      queueFinancialEventId: null,
    };
  }
  const transactionId = requireText(input.transaction.transactionId, "missing_ios_transaction_id");
  if (input.transaction.revocationType === RevocationType.FAMILY_REVOKE) {
    return {
      written: false,
      financial: null,
      uid: null,
      reviewRequired: false,
      reviewReason: null,
      reviewId: null,
      queueFinancialEventId: null,
    };
  }
  const resolvedUid = await resolveVerifiedRefundOwner(
    deps.store,
    input.transaction,
    input.expectedUid
  );
  const percentageDisposition = iosMonetaryRefundPercentageDisposition(input.transaction);
  if (percentageDisposition === "invalid") {
    const review = await persistUnsupportedIosRefundReview({
      deps,
      reviewId: iosInvalidRevocationPercentageReviewId(transactionId),
      reason: "invalid_ios_revocation_percentage",
      transaction: input.transaction,
      resolvedUid,
    });
    return {
      written: false,
      financial: null,
      uid: resolvedUid,
      reviewRequired: true,
      reviewReason: "invalid_ios_revocation_percentage",
      reviewId: review.reviewId,
      queueFinancialEventId: review.queueFinancialEventId,
    };
  }
  if (percentageDisposition === "prorated") {
    const review = await persistUnsupportedIosRefundReview({
      deps,
      reviewId: iosProratedRefundReviewId(transactionId),
      reason: "unsupported_ios_prorated_refund",
      transaction: input.transaction,
      resolvedUid,
    });
    return {
      written: false,
      financial: null,
      uid: resolvedUid,
      reviewRequired: true,
      reviewReason: "unsupported_ios_prorated_refund",
      reviewId: review.reviewId,
      queueFinancialEventId: review.queueFinancialEventId,
    };
  }
  if (percentageDisposition !== "full") {
    const review = await persistUnsupportedIosRefundReview({
      deps,
      reviewId: iosUnsupportedRevocationReviewId(transactionId),
      reason: "unsupported_ios_revocation_type",
      transaction: input.transaction,
      resolvedUid,
    });
    return {
      written: false,
      financial: null,
      uid: resolvedUid,
      reviewRequired: true,
      reviewReason: "unsupported_ios_revocation_type",
      reviewId: review.reviewId,
      queueFinancialEventId: review.queueFinancialEventId,
    };
  }
  const original = await locateOriginalIosSaleIfPresent(deps.store, transactionId);
  if (!original) {
    const review = await persistUnsupportedIosRefundReview({
      deps,
      reviewId: iosFullRefundMissingSaleReviewId(transactionId),
      reason: "ios_full_refund_original_sale_missing",
      transaction: input.transaction,
      resolvedUid,
      financialEventId: null,
    });
    return {
      written: false,
      financial: null,
      uid: resolvedUid,
      reviewRequired: true,
      reviewReason: "ios_full_refund_original_sale_missing",
      reviewId: review.reviewId,
      queueFinancialEventId: null,
    };
  }
  if (resolvedUid !== original.uid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_refund_owner_mismatch",
    });
  }
  const productId = requireText(input.transaction.productId, "unknown_ios_product");
  const canonicalSku = canonicalSkuForIos(productId);
  if (canonicalSku == null || original.canonicalSku !== canonicalSku) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_conflict",
    });
  }
  if (original.platform !== "ios" || !isIosSaleEventType(original.eventType)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_conflict",
    });
  }
  const saleOccurredAt = requireFiniteMillis(
    input.transaction.purchaseDate,
    "missing_ios_purchase_date"
  );
  if (original.occurredAt !== saleOccurredAt) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_conflict",
    });
  }
  const refundOccurredAt = requireFiniteMillis(
    input.transaction.revocationDate,
    "missing_ios_revocation_date"
  );
  const financial: VerifiedFinancialEvent = {
    financialEventId: financialEventIdForStore({
      platform: "ios",
      eventType: "refund",
      transactionId,
    }),
    eventType: "refund",
    platform: "ios",
    canonicalSku,
    grossAmountInPaise: original.grossAmountInPaise,
    actualPlatformCommissionInPaise: APPLE_PLATFORM_COMMISSION_IN_PAISE,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: refundOccurredAt,
    relatedFinancialEventId: original.financialEventId,
  };
  const catalog = getCatalogEntry(canonicalSku);
  const diagnosticUid = deps.diagnosticUidFor(original.uid);
  const applied = await applyTransitionIdempotent(
    deps,
    diagnosticUid,
    {
      uid: original.uid,
      source: input.source,
      eventSource: input.eventSource,
      idempotencyKey: financial.financialEventId,
      occurredAt: refundOccurredAt,
      nowMs: deps.nowMs(),
      requested: {
        kind: "recordFinancial",
        plan: catalog.plan,
        financialEvent: financial,
      },
    },
    financial
  );
  await invokeTaxHandoff(deps, original.uid, financial, applied);
  return {
    written: applied.financialEventWritten,
    financial,
    uid: original.uid,
    reviewRequired: false,
    reviewReason: null,
    reviewId: null,
    queueFinancialEventId: financial.financialEventId,
  };
}

async function reconcileAssnCurrentStatus(opts: {
  deps: IosBillingDeps;
  originalTransactionId: string;
  expectedUid: string;
  observationTime: number;
  durableQueueFinancialEventId: string | null;
  fallbackTransaction?: JWSTransactionDecodedPayload;
  reviewId: string | null;
  action: string;
  notificationUUID: string;
  financialEventWritten: boolean;
}): Promise<IosBillingResult & { action: string; notificationUUID: string | null }> {
  const incident: IosStatusReconciliationIncident = {
    kind: "assn",
    notificationUUID: opts.notificationUUID,
  };
  try {
    const result = await reconcileIosOriginalTransaction(opts.deps, {
      originalTransactionId: opts.originalTransactionId,
      expectedUid: opts.expectedUid,
      source: "assnV2",
      eventSource: "webhook",
      observationTime: opts.observationTime,
    });
    let resolveId = opts.durableQueueFinancialEventId;
    if (!resolveId && opts.fallbackTransaction) {
      try {
        const eventType = economicEventType(opts.fallbackTransaction.transactionReason);
        const txId = requireText(
          opts.fallbackTransaction.transactionId,
          "missing_ios_transaction_id"
        );
        const financialEventId = financialEventIdForStore({
          platform: "ios",
          eventType,
          transactionId: txId,
        });
        const existing = await readLedger(opts.deps.store, financialEventId);
        resolveId = existing?.financialEventId ?? null;
      } catch (err) {
        if (!(err instanceof BillingError && err.causeCode === "unknown_ios_transaction_reason")) {
          throw err;
        }
      }
    }
    await resolveIosStatusReconciliationIfPresent(
      opts.deps.store,
      opts.originalTransactionId,
      resolveId,
      opts.expectedUid,
      opts.deps.nowMs(),
      incident
    );
    if (opts.reviewId) {
      await markAppStoreFinancialReviewEntitlementReconciled(opts.deps.store, {
        id: opts.reviewId,
        uid: opts.expectedUid,
        nowMs: opts.deps.nowMs(),
      });
    }
    return {
      ...result,
      financialEventWritten: result.financialEventWritten || opts.financialEventWritten,
      action: opts.action,
      notificationUUID: opts.notificationUUID,
    };
  } catch (err) {
    if (isRetryableBillingError(err)) {
      let durableId = opts.durableQueueFinancialEventId;
      if (!durableId && opts.fallbackTransaction) {
        const eventType = economicEventType(opts.fallbackTransaction.transactionReason);
        const txId = requireText(
          opts.fallbackTransaction.transactionId,
          "missing_ios_transaction_id"
        );
        const financialEventId = financialEventIdForStore({
          platform: "ios",
          eventType,
          transactionId: txId,
        });
        const existing = await readLedger(opts.deps.store, financialEventId);
        durableId = existing?.financialEventId ?? null;
      }
      if (durableId) {
        await enqueueStatusReconciliation(
          opts.deps,
          opts.originalTransactionId,
          durableId,
          "ios_live_status_unavailable",
          incident
        );
      }
    }
    throw err;
  }
}

function reviewActionForReason(reason: string | null): string {
  if (reason === "unsupported_ios_prorated_refund") return "prorated_refund_review_reconciled";
  if (reason === "ios_full_refund_original_sale_missing") {
    return "full_refund_missing_sale_review_reconciled";
  }
  if (reason === "unsupported_ios_revocation_type") return "unsupported_revocation_review_reconciled";
  if (reason === "invalid_ios_revocation_percentage") {
    return "invalid_revocation_percentage_review_reconciled";
  }
  return "reconciled";
}

async function enrichMissingSaleReviewWithRefund(
  deps: IosBillingDeps,
  transaction: JWSTransactionDecodedPayload,
  refundFinancialEventId: string
): Promise<void> {
  const transactionId = requireText(transaction.transactionId, "missing_ios_transaction_id");
  const reviewId = iosFullRefundMissingSaleReviewId(transactionId);
  const existing = await readAppStoreFinancialReview(deps.store, reviewId);
  if (!existing) return;
  await ensureAppStoreFinancialReview(deps.store, {
    id: reviewId,
    reason: existing.reason,
    transactionId: existing.transactionId,
    originalTransactionId: existing.originalTransactionId,
    canonicalSku: existing.canonicalSku,
    financialEventId: refundFinancialEventId,
    uid: existing.uid,
    diagnosticUid: existing.diagnosticUid,
    nowMs: deps.nowMs(),
  });
}

function requireAssnNotificationUuid(notification: ResponseBodyV2DecodedPayload): string {
  const uuid = notification.notificationUUID;
  if (typeof uuid !== "string" || uuid.length === 0) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_notification_uuid",
    });
  }
  return uuid;
}

function ignoredAssnResult(
  action: string,
  notificationUUID: string | null
): IosBillingResult & { action: string; notificationUUID: string | null } {
  return {
    alreadyProcessed: true,
    financialEventWritten: false,
    historyWritten: false,
    skipped: action,
    uid: "",
    diagnosticUid: "",
    resultSummary: action,
    to: null,
    canonicalSku: null,
    appleStatus: null,
    reconciliationRequired: false,
    action,
    notificationUUID,
  };
}

export async function processIosNotification(
  deps: IosBillingDeps,
  signedPayload: unknown
): Promise<IosBillingResult & { action: string; notificationUUID: string | null }> {
  const jws = assertSignedJws(signedPayload, "invalid_signed_payload");
  const notification: ResponseBodyV2DecodedPayload =
    await deps.verifier.verifyAndDecodeNotification(jws);
  const notificationUUID =
    typeof notification.notificationUUID === "string" ? notification.notificationUUID : null;
  const observationTime =
    typeof notification.signedDate === "number" && Number.isFinite(notification.signedDate)
      ? notification.signedDate
      : deps.nowMs();

  if (notification.notificationType === NotificationTypeV2.TEST) {
    return {
      alreadyProcessed: true,
      financialEventWritten: false,
      historyWritten: false,
      skipped: "test_notification",
      uid: "",
      diagnosticUid: "",
      resultSummary: "test_notification",
      to: null,
      canonicalSku: null,
      appleStatus: null,
      reconciliationRequired: false,
      action: "test_ignored",
      notificationUUID,
    };
  }

  const ignoredAction = ignoredIosAssnAction(notification);
  if (ignoredAction) {
    return ignoredAssnResult(ignoredAction, notificationUUID);
  }

  const verifiedNotificationUUID = requireAssnNotificationUuid(notification);

  if (notification.notificationType === NotificationTypeV2.REFUND_REVERSED) {
    const nestedTxJws = notification.data?.signedTransactionInfo;
    if (!nestedTxJws) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "assn_missing_signed_transaction",
      });
    }
    const nestedTx = await assertVerifiedIosTransactionPointer(deps.verifier, nestedTxJws);
    const token = requireText(nestedTx.appAccountToken, "missing_ios_app_account_token");
    const ownerUid = await resolveUidFromAppAccountToken(deps.store, token);
    const transactionId = requireText(nestedTx.transactionId, "missing_ios_transaction_id");
    const originalTransactionId = requireText(
      nestedTx.originalTransactionId,
      "missing_ios_original_transaction_id"
    );
    const productId = requireText(nestedTx.productId, "unknown_ios_product");
    const canonicalSku = canonicalSkuForIos(productId);
    const refundFinancialEventId = await verifiedRefundFinancialEventIdIfPresent(
      deps.store,
      transactionId,
      ownerUid,
      canonicalSku
    );
    const reviewId = iosRefundReversedReviewId(transactionId);
    await ensureAppStoreFinancialReview(deps.store, {
      id: reviewId,
      reason: "unsupported_ios_refund_reversal",
      transactionId,
      originalTransactionId,
      canonicalSku,
      financialEventId: refundFinancialEventId,
      uid: ownerUid,
      diagnosticUid: deps.diagnosticUidFor(ownerUid),
      nowMs: deps.nowMs(),
    });
    return reconcileAssnCurrentStatus({
      deps,
      originalTransactionId,
      expectedUid: ownerUid,
      observationTime,
      durableQueueFinancialEventId: refundFinancialEventId,
      reviewId,
      action: "refund_reversal_review_reconciled",
      notificationUUID: verifiedNotificationUUID,
      financialEventWritten: false,
    });
  }

  const nestedTxJws = notification.data?.signedTransactionInfo;
  if (!nestedTxJws) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "assn_missing_signed_transaction",
    });
  }
  const nestedTx = await assertVerifiedIosTransactionPointer(deps.verifier, nestedTxJws);
  const token = requireText(nestedTx.appAccountToken, "missing_ios_app_account_token");
  const ownerUid = await resolveUidFromAppAccountToken(deps.store, token);
  const originalTransactionId = requireText(
    nestedTx.originalTransactionId,
    "missing_ios_original_transaction_id"
  );

  let refundWritten = false;
  let queueFinancialEventId: string | null = null;
  let reviewId: string | null = null;
  let reviewReason: string | null = null;
  if (
    notification.notificationType === NotificationTypeV2.REFUND ||
    (nestedTx.revocationType !== RevocationType.FAMILY_REVOKE &&
      (nestedTx.revocationDate != null || nestedTx.revocationType != null))
  ) {
    const refund = await recordIosRefundAdjustment(deps, {
      transaction: nestedTx,
      source: "assnV2",
      eventSource: "webhook",
      expectedUid: ownerUid,
    });
    refundWritten = refund.written;
    queueFinancialEventId = refund.queueFinancialEventId;
    reviewId = refund.reviewId;
    reviewReason = refund.reviewReason;
    if (refund.financial) {
      await enrichMissingSaleReviewWithRefund(deps, nestedTx, refund.financial.financialEventId);
    }
  }

  const result = await reconcileAssnCurrentStatus({
    deps,
    originalTransactionId,
    expectedUid: ownerUid,
    observationTime,
    durableQueueFinancialEventId: queueFinancialEventId,
    fallbackTransaction: nestedTx,
    reviewId,
    action: reviewActionForReason(reviewReason),
    notificationUUID: verifiedNotificationUUID,
    financialEventWritten: refundWritten,
  });

  if (reviewReason === "ios_full_refund_original_sale_missing") {
    const retry = await recordIosRefundAdjustment(deps, {
      transaction: nestedTx,
      source: "assnV2",
      eventSource: "webhook",
      expectedUid: ownerUid,
    });
    if (retry.financial) {
      await enrichMissingSaleReviewWithRefund(deps, nestedTx, retry.financial.financialEventId);
      return {
        ...result,
        financialEventWritten: result.financialEventWritten || retry.written,
      };
    }
  }

  return result;
}

export function companyHasNoAppleJws(company: CompanyBillingDoc | null): boolean {
  if (!company) return true;
  const blob = JSON.stringify(company);
  return (
    !blob.includes("signedTransactionInfo") &&
    !blob.includes("signedRenewalInfo") &&
    !blob.includes("signedPayload") &&
    !blob.includes("BEGIN PRIVATE")
  );
}
