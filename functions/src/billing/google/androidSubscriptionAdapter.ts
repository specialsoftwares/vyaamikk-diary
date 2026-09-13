/**
 * Google Play subscription adapter (VYD-32).
 *
 * Terminates at VerifiedPlatformEvent / VerifiedFinancialEvent /
 * CanonicalTransition and then calls applySubscriptionTransition.
 * Raw Google payloads never enter the Phase-B engine.
 *
 * RTDN is a signal only: callers must pass a purchase token pointer; this
 * module always uses purchases.subscriptionsv2.get as source of truth.
 */

import {
  applySubscriptionTransition,
  type ApplyTransitionResult,
} from "../applyTransition";
import type { CredentialCipher } from "../crypto";
import { credentialFingerprint } from "../crypto";
import { BillingError } from "../errors";
import { billingLog } from "../log";
import {
  companyBillingPath,
  financialLedgerPath,
  sanitizeDocId,
  subscriptionStatusPath,
} from "../paths";
import { canonicalSkuForAndroid, getCatalogEntry, isCanonicalSku, type CanonicalSku } from "../products";
import {
  ensureReconciliationWorkItem,
  refundReconciliationQueueId,
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
import { CANONICAL_PLAY_PACKAGE_NAME } from "./playConstants";
import { googlePaidOrderTotalToPaise } from "./playMoney";
import {
  assertFullyRefundedSubscriptionOrder,
  assertProcessedSubscriptionOrder,
  assertRefundSignalAgreesWithOrder,
  assertSubscriptionOrderLineItem,
  requireProcessedEventMillis,
  requireRefundEventAuthority,
} from "./playOrder";
import {
  assertOwnerMatchesCaller,
  playOwnershipIdentifiersPresent,
  resolvePlayPurchaseOwner,
} from "./playOwnership";
import { parseGoogleEventTimeMillis, parseRfc3339Millis, parseRfc3339MillisOrNull } from "./playTime";
import { assertPurchaseToken, assertOrderId } from "./playToken";
import type { PlayApi } from "./playApiClient";
import type {
  GoogleOrder,
  GoogleSubscriptionPurchaseLineItem,
  GoogleSubscriptionPurchaseV2,
} from "./playTypes";

export type PostCommitTaxHandoff = (input: {
  uid: string;
  financialEventId: string;
  eventType: "purchase" | "renewal" | "refund";
  grossAmountInPaise: number;
  canonicalSku: string;
  alreadyProcessed: boolean;
  financialEventWritten: boolean;
}) => Promise<void>;

export interface AndroidBillingDeps {
  store: BillingStore;
  play: PlayApi;
  cipher: CredentialCipher;
  diagnosticUidFor: (uid: string) => string;
  nowMs: () => number;
  postCommitTaxHandoff?: PostCommitTaxHandoff;
  packageName?: string;
}

export interface AndroidBillingResult {
  alreadyProcessed: boolean;
  financialEventWritten: boolean;
  historyWritten: boolean;
  acknowledged: boolean;
  skipped: string | null;
  uid: string;
  diagnosticUid: string;
  resultSummary: string;
  to: SubscriptionStatusDoc | null;
  canonicalSku: CanonicalSku | null;
  googleSubscriptionState: string | null;
  reconciliationRequired: boolean;
}

export function resolveAndroidCatalogFromLineItem(
  lineItem: GoogleSubscriptionPurchaseLineItem
): { productId: string; basePlanId: string; canonicalSku: CanonicalSku } {
  if (lineItem.prepaidPlan != null) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_prepaid_plan",
    });
  }
  if (lineItem.signupPromotion != null) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_play_offer",
    });
  }
  const offerId = lineItem.offerDetails?.offerId;
  if (typeof offerId === "string" && offerId.length > 0) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_play_offer",
    });
  }
  const productId = lineItem.productId;
  const basePlanId = lineItem.offerDetails?.basePlanId;
  if (typeof productId !== "string" || typeof basePlanId !== "string") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_android_sku",
    });
  }
  const canonicalSku = canonicalSkuForAndroid(productId, basePlanId);
  if (!canonicalSku) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_android_sku",
    });
  }
  return { productId, basePlanId, canonicalSku };
}

export function assertSingleAndroidLineItem(
  sub: GoogleSubscriptionPurchaseV2
): GoogleSubscriptionPurchaseLineItem {
  const items = sub.lineItems;
  if (!Array.isArray(items) || items.length !== 1) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_subscription_bundle",
    });
  }
  return items[0];
}

async function readCompany(
  store: BillingStore,
  uid: string
): Promise<CompanyBillingDoc | null> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(companyBillingPath(uid));
    if (!snap.exists) return null;
    return snap.data() as unknown as CompanyBillingDoc;
  });
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

function isPlayApiNotFound(err: unknown): boolean {
  return err instanceof BillingError && err.causeCode === "play_api_not_found";
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

function mapLifecycleKind(state: string): CanonicalTransitionKind | "skip" {
  switch (state) {
    case "SUBSCRIPTION_STATE_PENDING":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return "skip";
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "activatePaid";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "enterGrace";
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
      return "enterOnHold";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "cancel";
    case "SUBSCRIPTION_STATE_EXPIRED":
      return "expire";
    default:
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "unknown_google_subscription_state",
      });
  }
}

function emptyResult(
  uid: string,
  diagnosticUid: string,
  skipped: string,
  extras?: Partial<AndroidBillingResult>
): AndroidBillingResult {
  return {
    alreadyProcessed: true,
    financialEventWritten: false,
    historyWritten: false,
    acknowledged: false,
    skipped,
    uid,
    diagnosticUid,
    resultSummary: skipped,
    to: null,
    canonicalSku: null,
    googleSubscriptionState: extras?.googleSubscriptionState ?? null,
    reconciliationRequired: false,
    ...extras,
  };
}

async function invokeTaxHandoff(
  deps: AndroidBillingDeps,
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

function classifyPurchaseOrRenewal(opts: {
  company: CompanyBillingDoc | null;
  tokenFingerprint: string;
  orderId: string;
  existingPurchase: BillingEventLedgerDoc | null;
  existingRenewal: BillingEventLedgerDoc | null;
}): "purchase" | "renewal" {
  const { company, tokenFingerprint, orderId, existingPurchase, existingRenewal } = opts;
  if (existingPurchase && existingRenewal) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "purchase_renewal_classification_conflict",
    });
  }
  const impliedRenewal =
    company?.credentialFingerprint === tokenFingerprint &&
    typeof company.latestOrderId === "string" &&
    company.latestOrderId.length > 0 &&
    company.latestOrderId !== orderId;
  if (existingPurchase) {
    if (impliedRenewal) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "purchase_renewal_classification_conflict",
      });
    }
    return "purchase";
  }
  if (existingRenewal) return "renewal";
  return impliedRenewal ? "renewal" : "purchase";
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
  deps: AndroidBillingDeps,
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
    const plan = req.requested.plan ?? prior.plan;
    const periodEnd = req.requested.platformEvent?.currentPeriodEnd ?? prior.currentPeriodEnd ?? 0;
    if (!lifecycleAlreadyMatches(prior, req.requested.kind, plan, periodEnd)) {
      throw err;
    }
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

function cancelTimeMillis(sub: GoogleSubscriptionPurchaseV2): number | null {
  return parseRfc3339MillisOrNull(
    sub.canceledStateContext?.userInitiatedCancellation?.cancelTime,
    "invalid_cancel_time"
  );
}

async function acknowledgeIfRequired(opts: {
  play: PlayApi;
  purchaseToken: string;
  productId: string;
  acknowledgementState: string | undefined;
  subscriptionState: string;
  isSameTokenRenewal: boolean;
}): Promise<boolean> {
  if (opts.subscriptionState === "SUBSCRIPTION_STATE_PENDING") return false;
  if (opts.subscriptionState === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") {
    return false;
  }
  if (opts.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") return false;
  if (opts.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    if (opts.isSameTokenRenewal) return false;
    try {
      await opts.play.acknowledgeSubscription(opts.purchaseToken, opts.productId);
      return true;
    } catch {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "google_ack_failed",
        retryable: true,
      });
    }
  }
  if (!opts.isSameTokenRenewal) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_acknowledgement_state",
    });
  }
  return false;
}

interface ReconciledSuccessfulOrder {
  financial: VerifiedFinancialEvent;
  isRenewal: boolean;
  orderId: string;
  currentPeriodStart: number | null;
  alreadyInLedger: boolean;
}

async function reconcileLatestSuccessfulOrder(opts: {
  deps: AndroidBillingDeps;
  company: CompanyBillingDoc | null;
  uid: string;
  tokenFingerprint: string;
  canonicalSku: CanonicalSku;
  productId: string;
  basePlanId: string;
  latestSuccessfulOrderId: string;
}): Promise<ReconciledSuccessfulOrder> {
  const orderId = opts.latestSuccessfulOrderId;
  const purchaseLedgerId = financialEventIdForStore({
    platform: "android",
    eventType: "purchase",
    orderId,
  });
  const renewalLedgerId = financialEventIdForStore({
    platform: "android",
    eventType: "renewal",
    orderId,
  });
  const existingPurchase = await readLedger(opts.deps.store, purchaseLedgerId);
  const existingRenewal = await readLedger(opts.deps.store, renewalLedgerId);
  const eventType = classifyPurchaseOrRenewal({
    company: opts.company,
    tokenFingerprint: opts.tokenFingerprint,
    orderId,
    existingPurchase,
    existingRenewal,
  });
  const alreadyInLedger = eventType === "purchase" ? existingPurchase != null : existingRenewal != null;
  const order = await opts.deps.play.getOrder(orderId);
  const lineItem = alreadyInLedger
    ? assertSubscriptionOrderLineItem({
        order,
        expectedOrderId: orderId,
        productId: opts.productId,
        basePlanId: opts.basePlanId,
      })
    : assertProcessedSubscriptionOrder({
        order,
        expectedOrderId: orderId,
        productId: opts.productId,
        basePlanId: opts.basePlanId,
      });
  const grossAmountInPaise = alreadyInLedger
    ? eventType === "purchase"
      ? existingPurchase!.grossAmountInPaise
      : existingRenewal!.grossAmountInPaise
    : googlePaidOrderTotalToPaise(order.total);
  const orderOccurredAt = alreadyInLedger
    ? eventType === "purchase"
      ? existingPurchase!.occurredAt
      : existingRenewal!.occurredAt
    : requireProcessedEventMillis(order);
  if (alreadyInLedger) {
    const existing = eventType === "purchase" ? existingPurchase! : existingRenewal!;
    const processed =
      order.state === "PROCESSED" || order.state === "ORDER_STATE_PROCESSED";
    const expected: VerifiedFinancialEvent = {
      financialEventId: financialEventIdForStore({
        platform: "android",
        eventType,
        orderId,
      }),
      eventType,
      platform: "android",
      canonicalSku: opts.canonicalSku,
      grossAmountInPaise: processed
        ? googlePaidOrderTotalToPaise(order.total)
        : existing.grossAmountInPaise,
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: null,
      occurredAt: processed ? requireProcessedEventMillis(order) : existing.occurredAt,
      relatedFinancialEventId: null,
    };
    if (!financialReplayMatches(existing, expected, opts.uid)) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "financial_event_conflict",
      });
    }
  }
  const currentPeriodStart = parseRfc3339MillisOrNull(
    lineItem.subscriptionDetails?.servicePeriodStartTime,
    "invalid_service_period_start"
  );
  return {
    isRenewal: eventType === "renewal",
    orderId,
    currentPeriodStart,
    alreadyInLedger,
    financial: {
      financialEventId: financialEventIdForStore({
        platform: "android",
        eventType,
        orderId,
      }),
      eventType,
      platform: "android",
      canonicalSku: opts.canonicalSku,
      grossAmountInPaise,
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: null,
      occurredAt: orderOccurredAt,
      relatedFinancialEventId: null,
    },
  };
}

function buildPlatformEvent(opts: {
  catalog: { productId: string; basePlanId: string; canonicalSku: CanonicalSku };
  lineItem: GoogleSubscriptionPurchaseLineItem;
  fp: string;
  encrypted: VerifiedPlatformEvent["encryptedPurchaseCredential"];
  linkedCredentialFingerprint: string | null;
  reconciledAt: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number;
  latestOrderId: string | null;
}): VerifiedPlatformEvent {
  return {
    platform: "android",
    canonicalSku: opts.catalog.canonicalSku,
    productId: opts.catalog.productId,
    basePlanId: opts.catalog.basePlanId,
    currentPeriodStart: opts.currentPeriodStart,
    currentPeriodEnd: opts.currentPeriodEnd,
    autoRenewing: opts.lineItem.autoRenewingPlan?.autoRenewEnabled === true,
    latestOrderId: opts.latestOrderId,
    originalTransactionId: null,
    credentialFingerprint: opts.fp,
    encryptedPurchaseCredential: opts.encrypted,
    linkedCredentialFingerprint: opts.linkedCredentialFingerprint,
    reconciledAt: opts.reconciledAt,
  };
}

export async function processAndroidPurchaseToken(
  deps: AndroidBillingDeps,
  input: {
    purchaseToken: unknown;
    callerUid?: string;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    expectedCanonicalSku?: unknown;
    eventTimeMillis?: number | null;
    linkedFollowDepth?: number;
    expectedUid?: string;
  }
): Promise<AndroidBillingResult> {
  const purchaseToken = assertPurchaseToken(input.purchaseToken);
  const packageName = deps.packageName ?? CANONICAL_PLAY_PACKAGE_NAME;
  if (packageName !== CANONICAL_PLAY_PACKAGE_NAME) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "play_package_name_mismatch",
    });
  }
  if (input.expectedCanonicalSku != null) {
    if (typeof input.expectedCanonicalSku !== "string" || !isCanonicalSku(input.expectedCanonicalSku)) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "invalid_sku_hint",
      });
    }
  }

  const sub = await deps.play.getSubscriptionV2(purchaseToken);
  return reconcileFetchedSubscription(deps, {
    purchaseToken,
    sub,
    callerUid: input.callerUid,
    source: input.source,
    eventSource: input.eventSource,
    expectedCanonicalSku: input.expectedCanonicalSku,
    eventTimeMillis: input.eventTimeMillis,
    linkedFollowDepth: input.linkedFollowDepth ?? 0,
    expectedUid: input.expectedUid,
  });
}

async function skipPending(
  deps: AndroidBillingDeps,
  sub: GoogleSubscriptionPurchaseV2,
  skipped: string
): Promise<AndroidBillingResult> {
  let uid = "";
  let diagnosticUid = "unresolved";
  if (playOwnershipIdentifiersPresent(sub)) {
    try {
      const owner = await resolvePlayPurchaseOwner(deps.store, sub);
      uid = owner.uid;
      diagnosticUid = deps.diagnosticUidFor(uid);
    } catch {
      /* PENDING must not fail closed on unresolved owner / missing owned fields */
    }
  }
  billingLog("info", {
    diagnosticUid,
    platform: "android",
    googleSubscriptionState: sub.subscriptionState ?? undefined,
    result: "skipped_pending",
  });
  return emptyResult(uid, diagnosticUid, skipped, {
    googleSubscriptionState: sub.subscriptionState ?? null,
  });
}

async function reconcileFetchedSubscription(
  deps: AndroidBillingDeps,
  input: {
    purchaseToken: string;
    sub: GoogleSubscriptionPurchaseV2;
    callerUid?: string;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    expectedCanonicalSku?: unknown;
    eventTimeMillis?: number | null;
    linkedFollowDepth: number;
    expectedUid?: string;
  }
): Promise<AndroidBillingResult> {
  const state = input.sub.subscriptionState ?? "";
  const reconciledAt = deps.nowMs();

  if (state === "SUBSCRIPTION_STATE_PENDING") {
    return skipPending(deps, input.sub, "pending");
  }

  if (state === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") {
    const linkedRaw = input.sub.linkedPurchaseToken;
    if (typeof linkedRaw !== "string" || linkedRaw.length === 0) {
      return skipPending(deps, input.sub, "pending_purchase_canceled");
    }
    if (input.linkedFollowDepth >= 1) {
      return skipPending(deps, input.sub, "pending_purchase_canceled");
    }
    const linkedToken = assertPurchaseToken(linkedRaw);
    const linkedSub = await deps.play.getSubscriptionV2(linkedToken);
    return reconcileFetchedSubscription(deps, {
      purchaseToken: linkedToken,
      sub: linkedSub,
      callerUid: input.callerUid,
      source: input.source,
      eventSource: input.eventSource,
      expectedCanonicalSku: undefined,
      eventTimeMillis: input.eventTimeMillis,
      linkedFollowDepth: input.linkedFollowDepth + 1,
      expectedUid: input.expectedUid,
    });
  }

  const lifecycleKind = mapLifecycleKind(state);
  if (lifecycleKind === "skip") {
    return skipPending(deps, input.sub, "pending");
  }

  const lineItem = assertSingleAndroidLineItem(input.sub);
  const catalog = resolveAndroidCatalogFromLineItem(lineItem);
  if (
    typeof input.expectedCanonicalSku === "string" &&
    input.expectedCanonicalSku !== catalog.canonicalSku
  ) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "sku_hint_mismatch",
    });
  }

  if (!playOwnershipIdentifiersPresent(input.sub)) {
    throw new BillingError({
      clientCode: input.callerUid ? "verification_failed" : "temporary_unavailable",
      causeCode: input.callerUid ? "missing_obfuscated_account_id" : "unresolved_play_account_owner",
      retryable: !input.callerUid,
    });
  }
  const owner = await resolvePlayPurchaseOwner(deps.store, input.sub);
  if (input.expectedUid && owner.uid !== input.expectedUid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "refund_subscription_owner_mismatch",
    });
  }
  if (input.callerUid) {
    assertOwnerMatchesCaller(owner.uid, input.callerUid);
  }
  const uid = owner.uid;
  const diagnosticUid = deps.diagnosticUidFor(uid);

  const linkedRaw = input.sub.linkedPurchaseToken;
  const linkedCredentialFingerprint =
    typeof linkedRaw === "string" && linkedRaw.length > 0
      ? credentialFingerprint(linkedRaw)
      : null;

  const fp = credentialFingerprint(input.purchaseToken);
  const company = await readCompany(deps.store, uid);
  if (company?.invalidatedCredentialFingerprints?.includes(fp)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "invalidated_purchase_token",
    });
  }

  const encrypted = await deps.cipher.encryptCredential(input.purchaseToken);
  const currentPeriodEnd = parseRfc3339Millis(lineItem.expiryTime, "invalid_expiry_time");
  const plan = getCatalogEntry(catalog.canonicalSku).plan;
  const userCancelTime = cancelTimeMillis(input.sub);
  const observationTime =
    userCancelTime ??
    (typeof input.eventTimeMillis === "number" ? input.eventTimeMillis : null) ??
    reconciledAt;

  const latestSuccessfulOrderId =
    typeof lineItem.latestSuccessfulOrderId === "string" &&
    lineItem.latestSuccessfulOrderId.length > 0
      ? lineItem.latestSuccessfulOrderId
      : null;

  if (state === "SUBSCRIPTION_STATE_ACTIVE" && !latestSuccessfulOrderId) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_latest_successful_order_id",
    });
  }

  let economic: ReconciledSuccessfulOrder | null = null;
  if (latestSuccessfulOrderId) {
    economic = await reconcileLatestSuccessfulOrder({
      deps,
      company,
      uid,
      tokenFingerprint: fp,
      canonicalSku: catalog.canonicalSku,
      productId: catalog.productId,
      basePlanId: catalog.basePlanId,
      latestSuccessfulOrderId,
    });
  }

  const platformEvent = buildPlatformEvent({
    catalog,
    lineItem,
    fp,
    encrypted,
    linkedCredentialFingerprint,
    reconciledAt,
    currentPeriodStart: economic?.currentPeriodStart ?? null,
    currentPeriodEnd,
    latestOrderId: economic?.orderId ?? latestSuccessfulOrderId,
  });

  let financialEventWritten = false;
  let historyWritten = false;
  let alreadyProcessed = true;
  let to: SubscriptionStatusDoc | null = await readStatus(deps.store, uid);
  let lastSummary = to
    ? `${to.billingStatus}:${to.plan}:${to.entitlementActive ? "1" : "0"}`
    : "noop";

  if (economic && !economic.alreadyInLedger) {
    const economicKind: CanonicalTransitionKind = economic.isRenewal ? "renew" : "activatePaid";
    const economicReq: TransitionRequest = {
      uid,
      source: input.source,
      eventSource: input.eventSource,
      idempotencyKey: economic.financial.financialEventId,
      occurredAt: economic.financial.occurredAt,
      nowMs: reconciledAt,
      requested: {
        kind: economicKind,
        plan,
        platformEvent,
        financialEvent: economic.financial,
        googleSubscriptionState: state,
      },
    };
    const applied = await applyTransitionIdempotent(
      deps,
      diagnosticUid,
      economicReq,
      economic.financial
    );
    financialEventWritten = applied.financialEventWritten || financialEventWritten;
    historyWritten = applied.historyWritten || historyWritten;
    alreadyProcessed = alreadyProcessed && applied.alreadyProcessed;
    to = applied.to;
    lastSummary = applied.resultSummary;
    await invokeTaxHandoff(deps, uid, economic.financial, applied);
  }

  const liveKind = lifecycleKind;
  if (!lifecycleAlreadyMatches(to, liveKind, plan, currentPeriodEnd)) {
    const lifecycleKey = `android:life:${fp}:${state}:${currentPeriodEnd}`;
    const lifecycleReq: TransitionRequest = {
      uid,
      source: input.source,
      eventSource: input.eventSource,
      idempotencyKey: lifecycleKey,
      occurredAt: observationTime,
      nowMs: reconciledAt,
      requested: {
        kind: liveKind,
        plan,
        platformEvent,
        cancelledAt: liveKind === "cancel" ? observationTime : undefined,
        gracePeriodEndsAt: liveKind === "enterGrace" ? currentPeriodEnd : undefined,
        googleSubscriptionState: state,
      },
    };
    const applied = await applyTransitionIdempotent(deps, diagnosticUid, lifecycleReq);
    historyWritten = applied.historyWritten || historyWritten;
    alreadyProcessed = alreadyProcessed && applied.alreadyProcessed;
    to = applied.to;
    lastSummary = applied.resultSummary;
  }

  const acknowledged = await acknowledgeIfRequired({
    play: deps.play,
    purchaseToken: input.purchaseToken,
    productId: catalog.productId,
    acknowledgementState: input.sub.acknowledgementState,
    subscriptionState: state,
    isSameTokenRenewal: economic?.isRenewal === true,
  });

  billingLog("info", {
    diagnosticUid,
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
    orderId: economic?.orderId,
    reconciledAt,
    result: alreadyProcessed ? "already_processed" : "ok",
  });

  return {
    alreadyProcessed,
    financialEventWritten,
    historyWritten,
    acknowledged,
    skipped: null,
    uid,
    diagnosticUid,
    resultSummary: lastSummary,
    to,
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
    reconciliationRequired: false,
  };
}

async function decryptVerifiedCurrentPurchaseToken(
  cipher: CredentialCipher,
  company: CompanyBillingDoc | null
): Promise<string | null> {
  if (!company?.encryptedPurchaseCredential || !company.credentialFingerprint) {
    return null;
  }
  const plaintext = await cipher.decryptCredential(company.encryptedPurchaseCredential);
  if (credentialFingerprint(plaintext) !== company.credentialFingerprint) {
    return null;
  }
  return plaintext;
}

async function enqueueRefundReconciliation(opts: {
  deps: AndroidBillingDeps;
  orderId: string;
  financialEventId: string;
  reason: string;
  credentialFingerprint: string | null;
  nowMs: number;
}): Promise<void> {
  await ensureReconciliationWorkItem(opts.deps.store, {
    id: refundReconciliationQueueId(opts.orderId),
    reason: opts.reason,
    platform: "android",
    financialEventId: opts.financialEventId,
    credentialFingerprint: opts.credentialFingerprint,
    nowMs: opts.nowMs,
  });
}

export async function processAndroidVoidedPurchase(
  deps: AndroidBillingDeps,
  input: {
    purchaseToken: unknown;
    orderId: unknown;
    productType: unknown;
    refundType: unknown;
    source: BillingMutationSource;
    eventTimeMillis: unknown;
  }
): Promise<AndroidBillingResult> {
  if (input.productType !== 1 && input.productType !== "SUBSCRIPTION") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_void_product_type",
    });
  }
  if (input.refundType === 2 || input.refundType === "QUANTITY_BASED_PARTIAL_REFUND") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_partial_refund",
    });
  }
  if (input.refundType !== 1 && input.refundType !== "FULL_REFUND" && input.refundType != null) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_partial_refund",
    });
  }

  const rtdnPurchaseToken = assertPurchaseToken(input.purchaseToken);
  const orderId = assertOrderId(input.orderId);
  const rtdnEventTimeMillis = parseGoogleEventTimeMillis(
    input.eventTimeMillis,
    "missing_rtdn_event_time"
  );
  const packageName = deps.packageName ?? CANONICAL_PLAY_PACKAGE_NAME;
  if (packageName !== CANONICAL_PLAY_PACKAGE_NAME) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "play_package_name_mismatch",
    });
  }

  const purchaseLedgerId = financialEventIdForStore({
    platform: "android",
    eventType: "purchase",
    orderId,
  });
  const renewalLedgerId = financialEventIdForStore({
    platform: "android",
    eventType: "renewal",
    orderId,
  });
  const existingPurchase = await readLedger(deps.store, purchaseLedgerId);
  const existingRenewal = await readLedger(deps.store, renewalLedgerId);
  if (existingPurchase && existingRenewal) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "purchase_renewal_classification_conflict",
    });
  }
  const original = existingPurchase ?? existingRenewal;
  if (!original) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "missing_original_financial_event",
      retryable: true,
    });
  }

  if (!isCanonicalSku(original.canonicalSku)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_android_sku",
    });
  }
  const originalSku = original.canonicalSku;
  const catalogEntry = getCatalogEntry(originalSku);
  const order = await deps.play.getOrder(orderId);
  assertFullyRefundedSubscriptionOrder({
    order,
    expectedOrderId: orderId,
    productId: catalogEntry.android.productId,
    basePlanId: catalogEntry.android.basePlanId,
  });
  const processedEventTimeMillis = requireProcessedEventMillis(order);
  const refundAuthority = requireRefundEventAuthority(order);
  if (refundAuthority.grossAmountInPaise !== original.grossAmountInPaise) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "refund_gross_mismatch",
    });
  }
  assertRefundSignalAgreesWithOrder({
    rtdnEventTimeMillis,
    refundEventTimeMillis: refundAuthority.occurredAt,
    processedEventTimeMillis,
  });
  const refundOccurredAt = refundAuthority.occurredAt;
  const grossAmountInPaise = refundAuthority.grossAmountInPaise;

  const uid = original.uid;
  const diagnosticUid = deps.diagnosticUidFor(uid);
  const reconciledAt = deps.nowMs();

  const financial: VerifiedFinancialEvent = {
    financialEventId: financialEventIdForStore({
      platform: "android",
      eventType: "refund",
      orderId,
    }),
    eventType: "refund",
    platform: "android",
    canonicalSku: originalSku,
    grossAmountInPaise,
    actualPlatformCommissionInPaise: null,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: refundOccurredAt,
    relatedFinancialEventId: original.financialEventId,
  };

  const refundReq: TransitionRequest = {
    uid,
    source: input.source,
    eventSource: "webhook",
    idempotencyKey: financial.financialEventId,
    occurredAt: refundOccurredAt,
    nowMs: reconciledAt,
    requested: {
      kind: "recordFinancial",
      plan: catalogEntry.plan,
      financialEvent: financial,
    },
  };
  const refundApply = await applyTransitionIdempotent(deps, diagnosticUid, refundReq, financial);
  await invokeTaxHandoff(deps, uid, financial, refundApply);

  const company = await readCompany(deps.store, uid);
  const rtdnFingerprint = credentialFingerprint(rtdnPurchaseToken);
  const currentFingerprint = company?.credentialFingerprint ?? null;
  const rtdnTokenIsCurrent = currentFingerprint != null && currentFingerprint === rtdnFingerprint;

  async function refundRecordedWithoutLiveReconcile(
    reason: string,
    extras?: Partial<AndroidBillingResult>
  ): Promise<AndroidBillingResult> {
    await enqueueRefundReconciliation({
      deps,
      orderId,
      financialEventId: financial.financialEventId,
      reason,
      credentialFingerprint: currentFingerprint,
      nowMs: reconciledAt,
    });
    const to = extras?.to ?? (await readStatus(deps.store, uid));
    billingLog("warn", {
      diagnosticUid,
      platform: "android",
      orderId,
      result: reason,
      causeCode: reason,
    });
    return {
      alreadyProcessed: refundApply.alreadyProcessed,
      financialEventWritten: refundApply.financialEventWritten,
      historyWritten: refundApply.historyWritten,
      acknowledged: false,
      skipped: null,
      uid,
      diagnosticUid,
      resultSummary: reason,
      to,
      canonicalSku: originalSku,
      googleSubscriptionState: extras?.googleSubscriptionState ?? null,
      reconciliationRequired: true,
    };
  }

  let liveToken: string | null = null;
  if (rtdnTokenIsCurrent) {
    liveToken = rtdnPurchaseToken;
  } else {
    try {
      liveToken = await decryptVerifiedCurrentPurchaseToken(deps.cipher, company);
    } catch (err) {
      if (isRetryableBillingError(err)) throw err;
      liveToken = null;
    }
    if (!liveToken) {
      return refundRecordedWithoutLiveReconcile("current_purchase_token_unavailable");
    }
  }

  let liveSub: GoogleSubscriptionPurchaseV2 | null = null;
  try {
    liveSub = await deps.play.getSubscriptionV2(liveToken);
  } catch (err) {
    if (isRetryableBillingError(err)) throw err;
    if (!isPlayApiNotFound(err)) {
      return refundRecordedWithoutLiveReconcile(
        err instanceof BillingError ? err.causeCode : "refund_live_reconciliation_failed"
      );
    }
    return refundRecordedWithoutLiveReconcile("play_subscription_unqueryable");
  }

  try {
    const live = await reconcileFetchedSubscription(deps, {
      purchaseToken: liveToken,
      sub: liveSub,
      source: input.source,
      eventSource: "webhook",
      eventTimeMillis: rtdnEventTimeMillis,
      linkedFollowDepth: 0,
      expectedUid: uid,
    });
    billingLog("info", {
      diagnosticUid,
      platform: "android",
      canonicalSku: live.canonicalSku ?? undefined,
      googleSubscriptionState: live.googleSubscriptionState ?? undefined,
      orderId,
      result: refundApply.alreadyProcessed && live.alreadyProcessed ? "already_processed" : "ok",
      eventType: "refund",
    });
    return {
      alreadyProcessed: refundApply.alreadyProcessed && live.alreadyProcessed,
      financialEventWritten: refundApply.financialEventWritten || live.financialEventWritten,
      historyWritten: refundApply.historyWritten || live.historyWritten,
      acknowledged: live.acknowledged,
      skipped: null,
      uid,
      diagnosticUid,
      resultSummary: live.resultSummary,
      to: live.to,
      canonicalSku: live.canonicalSku ?? originalSku,
      googleSubscriptionState: live.googleSubscriptionState,
      reconciliationRequired: false,
    };
  } catch (err) {
    if (isRetryableBillingError(err)) throw err;
    const reason =
      err instanceof BillingError ? err.causeCode : "refund_live_reconciliation_failed";
    return refundRecordedWithoutLiveReconcile(reason);
  }
}

export {
  assertFullyRefundedSubscriptionOrder,
  assertPaidSubscriptionOrder,
  assertProcessedSubscriptionOrder,
} from "./playOrder";
export type { GoogleOrder };
