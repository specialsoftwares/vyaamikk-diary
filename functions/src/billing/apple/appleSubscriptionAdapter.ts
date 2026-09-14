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
  financialLedgerPath,
  sanitizeDocId,
  subscriptionStatusPath,
} from "../paths";
import { canonicalSkuForIos, getCatalogEntry, type CanonicalSku } from "../products";
import {
  ensureReconciliationWorkItem,
  iosStatusReconciliationQueueId,
  resolveReconciliationWorkItem,
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

interface VerifiedIosCurrent {
  uid: string;
  status: number;
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload;
}

const FULL_REFUND_PERCENTAGE_MILLIUNITS = 100_000;

function iosReviewQueueId(kind: string, transactionId: string): string {
  return `ios:review:${kind}:${transactionId.replace(/\//g, "_")}`;
}

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
  kind: CanonicalTransitionKind,
  plan: VyaamikkPlan,
  currentPeriodEnd: number
): boolean {
  if (!status) return false;
  if (kind === "expire") return status.billingStatus === "expired";
  if (kind === "activatePaid" || kind === "renew") {
    return (
      status.billingStatus === "active" &&
      status.plan === plan &&
      status.currentPeriodEnd === currentPeriodEnd
    );
  }
  if (kind === "enterGrace") {
    return (
      status.billingStatus === "grace" &&
      status.plan === plan &&
      status.currentPeriodEnd === currentPeriodEnd
    );
  }
  if (kind === "enterOnHold") {
    return status.billingStatus === "onHold" && status.plan === plan;
  }
  if (kind === "cancel") {
    return (
      status.billingStatus === "cancelled" &&
      status.plan === plan &&
      status.currentPeriodEnd === currentPeriodEnd
    );
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
  return tx;
}

function currentStatesEquivalent(a: VerifiedIosCurrent, b: VerifiedIosCurrent): boolean {
  return (
    a.uid === b.uid &&
    a.status === b.status &&
    a.transaction.transactionId === b.transaction.transactionId &&
    a.transaction.originalTransactionId === b.transaction.originalTransactionId &&
    a.transaction.productId === b.transaction.productId &&
    a.renewal.autoRenewStatus === b.renewal.autoRenewStatus &&
    a.transaction.expiresDate === b.transaction.expiresDate
  );
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
      if (transaction.originalTransactionId !== opts.originalTransactionId) continue;
      if (transaction.bundleId !== CANONICAL_IOS_BUNDLE_ID) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "apple_app_identifier_mismatch",
        });
      }
      if (transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) continue;
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
  reason: string
): Promise<void> {
  await ensureReconciliationWorkItem(deps.store, {
    id: iosStatusReconciliationQueueId(originalTransactionId),
    reason,
    platform: "ios",
    financialEventId,
    credentialFingerprint: null,
    nowMs: deps.nowMs(),
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

  if (!lifecycleAlreadyMatches(to, mapped.kind, plan, currentPeriodEnd)) {
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

  await resolveReconciliationWorkItem(deps.store, {
    id: iosStatusReconciliationQueueId(input.originalTransactionId),
    platform: "ios",
    financialEventId: financial.financialEventId,
    nowMs: reconciledAt,
  });

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
  void input.expectedCanonicalSku;
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
    return await reconcileIosOriginalTransaction(deps, {
      originalTransactionId,
      expectedUid: ownerUid,
      source: input.source,
      eventSource: input.eventSource,
      observationTime: deps.nowMs(),
    });
  } catch (err) {
    if (isRetryableBillingError(err)) {
      const txId = requireText(pointer.transactionId, "missing_ios_transaction_id");
      const eventType = pointer.transactionReason
        ? economicEventType(pointer.transactionReason)
        : "purchase";
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
          financialEventId,
          "ios_live_status_unavailable"
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

export async function recordIosFullRefundIfPresent(
  deps: IosBillingDeps,
  input: {
    transaction: JWSTransactionDecodedPayload;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
  }
): Promise<{ written: boolean; financial: VerifiedFinancialEvent | null; uid: string | null }> {
  if (input.transaction.revocationDate == null && input.transaction.revocationType == null) {
    return { written: false, financial: null, uid: null };
  }
  const transactionId = requireText(input.transaction.transactionId, "missing_ios_transaction_id");
  if (input.transaction.revocationType === RevocationType.FAMILY_REVOKE) {
    return { written: false, financial: null, uid: null };
  }
  if (input.transaction.revocationType === RevocationType.REFUND_PRORATED) {
    const original = await locateOriginalIosSale(deps.store, transactionId).catch(() => null);
    await ensureReconciliationWorkItem(deps.store, {
      id: iosReviewQueueId("prorated-refund", transactionId),
      reason: "unsupported_ios_prorated_refund",
      platform: "ios",
      financialEventId: original?.financialEventId ?? `ios:review:prorated:${transactionId}`,
      credentialFingerprint: null,
      nowMs: deps.nowMs(),
    });
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unsupported_ios_prorated_refund",
    });
  }
  if (input.transaction.revocationType !== RevocationType.REFUND_FULL) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_ios_revocation_type",
    });
  }
  if (
    input.transaction.revocationPercentage != null &&
    input.transaction.revocationPercentage !== FULL_REFUND_PERCENTAGE_MILLIUNITS
  ) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unsupported_ios_prorated_refund",
    });
  }
  const original = await locateOriginalIosSale(deps.store, transactionId);
  const productId = requireText(input.transaction.productId, "unknown_ios_product");
  const canonicalSku = canonicalSkuForIos(productId);
  if (canonicalSku == null || original.canonicalSku !== canonicalSku) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_conflict",
    });
  }
  if (original.platform !== "ios" || (original.eventType !== "purchase" && original.eventType !== "renewal")) {
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
  return { written: applied.financialEventWritten, financial, uid: original.uid };
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

  if (notification.notificationType === NotificationTypeV2.REFUND_REVERSED) {
    const nested = notification.data?.signedTransactionInfo;
    const tx = nested
      ? await deps.verifier.verifyAndDecodeTransaction(assertSignedJws(nested, "invalid_signed_transaction_info"))
      : null;
    const transactionId = tx?.transactionId ?? "unknown";
    await ensureReconciliationWorkItem(deps.store, {
      id: iosReviewQueueId("refund-reversed", transactionId),
      reason: "unsupported_ios_refund_reversal",
      platform: "ios",
      financialEventId: `ios:review:refund-reversed:${transactionId}`,
      credentialFingerprint: null,
      nowMs: deps.nowMs(),
    });
    return {
      alreadyProcessed: true,
      financialEventWritten: false,
      historyWritten: false,
      skipped: "unsupported_ios_refund_reversal",
      uid: "",
      diagnosticUid: "",
      resultSummary: "unsupported_ios_refund_reversal",
      to: null,
      canonicalSku: null,
      appleStatus: null,
      reconciliationRequired: true,
      action: "refund_reversal_review",
      notificationUUID,
    };
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
  if (notification.notificationType === NotificationTypeV2.REFUND) {
    const refund = await recordIosFullRefundIfPresent(deps, {
      transaction: nestedTx,
      source: "assnV2",
      eventSource: "webhook",
    });
    refundWritten = refund.written;
  } else if (nestedTx.revocationType === RevocationType.FAMILY_REVOKE) {
    // Not a monetary refund. Current status still decides access.
  } else if (nestedTx.revocationDate != null || nestedTx.revocationType != null) {
    await recordIosFullRefundIfPresent(deps, {
      transaction: nestedTx,
      source: "assnV2",
      eventSource: "webhook",
    });
  }

  try {
    const result = await reconcileIosOriginalTransaction(deps, {
      originalTransactionId,
      expectedUid: ownerUid,
      source: "assnV2",
      eventSource: "webhook",
      observationTime,
    });
    return {
      ...result,
      financialEventWritten: result.financialEventWritten || refundWritten,
      action: "reconciled",
      notificationUUID,
    };
  } catch (err) {
    if (isRetryableBillingError(err)) {
      const txId = requireText(nestedTx.transactionId, "missing_ios_transaction_id");
      const financialEventId = financialEventIdForStore({
        platform: "ios",
        eventType: "purchase",
        transactionId: txId,
      });
      const existing = await readLedger(deps.store, financialEventId);
      if (existing || refundWritten) {
        await enqueueStatusReconciliation(
          deps,
          originalTransactionId,
          existing?.financialEventId ?? financialEventId,
          "ios_live_status_unavailable"
        );
      }
    }
    throw err;
  }
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
