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
import { companyBillingPath, financialLedgerPath, sanitizeDocId } from "../paths";
import { canonicalSkuForAndroid, getCatalogEntry, isCanonicalSku, type CanonicalSku } from "../products";
import type { BillingStore } from "../store";
import {
  financialEventIdForStore,
  type CanonicalTransition,
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
} from "../types";
import { CANONICAL_PLAY_PACKAGE_NAME } from "./playConstants";
import { googlePaidOrderTotalToPaise } from "./playMoney";
import {
  assertOwnerMatchesCaller,
  playOwnershipIdentifiersPresent,
  resolvePlayPurchaseOwner,
} from "./playOwnership";
import { parseRfc3339Millis, parseRfc3339MillisOrNull } from "./playTime";
import { assertOrderId, assertPurchaseToken } from "./playToken";
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
}

const PAID_ORDER_STATES = new Set(["PROCESSED", "ORDER_STATE_PROCESSED"]);

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

function assertPackageName(actual: string | undefined, expected: string): void {
  if (actual != null && actual !== expected) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "rtdn_wrong_package",
    });
  }
}

function validatePaidOrder(opts: {
  order: GoogleOrder;
  expectedOrderId: string;
  productId: string;
  basePlanId: string;
  packageName: string;
}): void {
  if (opts.order.orderId && opts.order.orderId !== opts.expectedOrderId) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "order_id_mismatch",
    });
  }
  assertPackageName(opts.order.packageName, opts.packageName);
  const state = opts.order.state ?? "";
  if (!PAID_ORDER_STATES.has(state)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "order_not_processable",
    });
  }
  const productOk =
    !opts.order.lineItems ||
    opts.order.lineItems.length === 0 ||
    opts.order.lineItems.some((item) => item.productId === opts.productId);
  if (!productOk) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "order_product_mismatch",
    });
  }
  const orderBase = opts.order.subscriptionDetails?.basePlanId;
  if (typeof orderBase === "string" && orderBase.length > 0 && orderBase !== opts.basePlanId) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "order_base_plan_mismatch",
    });
  }
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

async function acknowledgeIfRequired(opts: {
  play: PlayApi;
  purchaseToken: string;
  productId: string;
  acknowledgementState: string | undefined;
  subscriptionState: string;
  isRenewal: boolean;
  isNewPurchase: boolean;
}): Promise<boolean> {
  if (opts.subscriptionState === "SUBSCRIPTION_STATE_PENDING") return false;
  if (opts.subscriptionState === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") return false;
  if (opts.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") return false;
  if (opts.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    if (opts.isRenewal) return false;
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
  if (opts.isNewPurchase) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_acknowledgement_state",
    });
  }
  return false;
}

export async function processAndroidPurchaseToken(
  deps: AndroidBillingDeps,
  input: {
    purchaseToken: unknown;
    callerUid?: string;
    source: BillingMutationSource;
    eventSource: TransitionRequest["eventSource"];
    expectedCanonicalSku?: unknown;
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
  const reconciledAt = deps.nowMs();
  const lineItem = assertSingleAndroidLineItem(sub);
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

  if (!playOwnershipIdentifiersPresent(sub)) {
    throw new BillingError({
      clientCode: input.callerUid ? "verification_failed" : "temporary_unavailable",
      causeCode: input.callerUid ? "missing_obfuscated_account_id" : "unresolved_play_account_owner",
      retryable: !input.callerUid,
    });
  }
  const owner = await resolvePlayPurchaseOwner(deps.store, sub);
  if (input.callerUid) {
    assertOwnerMatchesCaller(owner.uid, input.callerUid);
  }
  const uid = owner.uid;
  const diagnosticUid = deps.diagnosticUidFor(uid);

  const state = sub.subscriptionState ?? "";
  const linkedRaw = sub.linkedPurchaseToken;
  const linkedCredentialFingerprint =
    typeof linkedRaw === "string" && linkedRaw.length > 0
      ? credentialFingerprint(linkedRaw)
      : null;

  const fp = credentialFingerprint(purchaseToken);
  const company = await readCompany(deps.store, uid);
  if (company?.invalidatedCredentialFingerprints?.includes(fp)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "invalidated_purchase_token",
    });
  }

  const encrypted = await deps.cipher.encryptCredential(purchaseToken);
  const currentPeriodEnd = parseRfc3339Millis(lineItem.expiryTime, "invalid_expiry_time");

  const lifecycleKind = mapLifecycleKind(state);
  if (lifecycleKind === "skip") {
    billingLog("info", {
      diagnosticUid,
      platform: "android",
      googleSubscriptionState: state,
      result: "skipped_pending",
    });
    return emptyResult(uid, diagnosticUid, state === "SUBSCRIPTION_STATE_PENDING" ? "pending" : "pending_purchase_canceled", {
      googleSubscriptionState: state,
      canonicalSku: catalog.canonicalSku,
    });
  }

  let financial: VerifiedFinancialEvent | undefined;
  let kind: CanonicalTransitionKind = lifecycleKind;
  let isRenewal = false;
  let orderId: string | null = null;
  let currentPeriodStart: number | null = null;

  if (state === "SUBSCRIPTION_STATE_ACTIVE") {
    const latestSuccessfulOrderId = lineItem.latestSuccessfulOrderId;
    if (typeof latestSuccessfulOrderId !== "string" || latestSuccessfulOrderId.length === 0) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "missing_latest_successful_order_id",
      });
    }
    orderId = latestSuccessfulOrderId;
    const order = await deps.play.getOrder(orderId);
    validatePaidOrder({
      order,
      expectedOrderId: orderId,
      productId: catalog.productId,
      basePlanId: catalog.basePlanId,
      packageName,
    });
    const grossAmountInPaise = googlePaidOrderTotalToPaise(order.total);
    const orderOccurredAt =
      parseRfc3339MillisOrNull(order.createTime, "invalid_order_create_time") ?? currentPeriodEnd;
    currentPeriodStart = parseRfc3339MillisOrNull(
      order.subscriptionDetails?.servicePeriodStartTime,
      "invalid_service_period_start"
    );
    const sameToken = company?.credentialFingerprint === fp;
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
    if (existingPurchase) {
      isRenewal = false;
    } else if (existingRenewal) {
      isRenewal = true;
    } else {
      isRenewal = Boolean(
        sameToken && company?.latestOrderId && company.latestOrderId !== orderId
      );
    }
    const eventType = isRenewal ? "renewal" : "purchase";
    kind = isRenewal ? "renew" : "activatePaid";
    financial = {
      financialEventId: financialEventIdForStore({
        platform: "android",
        eventType,
        orderId,
      }),
      eventType,
      platform: "android",
      canonicalSku: catalog.canonicalSku,
      grossAmountInPaise,
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: null,
      occurredAt: orderOccurredAt,
      relatedFinancialEventId: null,
    };
  } else if (state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
    kind = "enterGrace";
  } else if (state === "SUBSCRIPTION_STATE_ON_HOLD" || state === "SUBSCRIPTION_STATE_PAUSED") {
    kind = "enterOnHold";
  } else if (state === "SUBSCRIPTION_STATE_CANCELED") {
    kind = "cancel";
  } else if (state === "SUBSCRIPTION_STATE_EXPIRED") {
    kind = "expire";
  }

  const platformEvent: VerifiedPlatformEvent = {
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    productId: catalog.productId,
    basePlanId: catalog.basePlanId,
    currentPeriodStart,
    currentPeriodEnd,
    autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
    latestOrderId: orderId ?? lineItem.latestSuccessfulOrderId ?? null,
    originalTransactionId: null,
    credentialFingerprint: fp,
    encryptedPurchaseCredential: encrypted,
    linkedCredentialFingerprint,
    reconciledAt,
  };

  const requested: CanonicalTransition = {
    kind,
    plan: getCatalogEntry(catalog.canonicalSku).plan,
    platformEvent,
    financialEvent: financial,
    gracePeriodEndsAt: kind === "enterGrace" ? currentPeriodEnd : undefined,
    googleSubscriptionState: state,
  };

  const idempotencyKey = financial
    ? `android:${financial.eventType}:${orderId}:${input.eventSource}`
    : `android:life:${fp}:${state}:${currentPeriodEnd}:${input.eventSource}`;

  const req: TransitionRequest = {
    uid,
    source: input.source,
    eventSource: input.eventSource,
    idempotencyKey,
    occurredAt: financial?.occurredAt ?? currentPeriodEnd,
    nowMs: reconciledAt,
    requested,
  };

  const applyResult = await applySubscriptionTransition(
    { store: deps.store, diagnosticUid },
    req
  );

  const acknowledged = await acknowledgeIfRequired({
    play: deps.play,
    purchaseToken,
    productId: catalog.productId,
    acknowledgementState: sub.acknowledgementState,
    subscriptionState: state,
    isRenewal,
    isNewPurchase: kind === "activatePaid" && !isRenewal,
  });

  if (financial) {
    await invokeTaxHandoff(deps, uid, financial, applyResult);
  }

  billingLog("info", {
    diagnosticUid,
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
    orderId: orderId ?? undefined,
    reconciledAt,
    result: applyResult.alreadyProcessed ? "already_processed" : "ok",
  });

  return {
    alreadyProcessed: applyResult.alreadyProcessed,
    financialEventWritten: applyResult.financialEventWritten,
    historyWritten: applyResult.historyWritten,
    acknowledged,
    skipped: null,
    uid,
    diagnosticUid,
    resultSummary: applyResult.resultSummary,
    to: applyResult.to,
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
  };
}

export async function processAndroidVoidedPurchase(
  deps: AndroidBillingDeps,
  input: {
    purchaseToken: unknown;
    orderId: unknown;
    productType: unknown;
    refundType: unknown;
    source: BillingMutationSource;
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

  const purchaseToken = assertPurchaseToken(input.purchaseToken);
  const orderId = assertOrderId(input.orderId);
  const packageName = deps.packageName ?? CANONICAL_PLAY_PACKAGE_NAME;

  const sub = await deps.play.getSubscriptionV2(purchaseToken);
  const reconciledAt = deps.nowMs();
  const lineItem = assertSingleAndroidLineItem(sub);
  const catalog = resolveAndroidCatalogFromLineItem(lineItem);
  if (!playOwnershipIdentifiersPresent(sub)) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "unresolved_play_account_owner",
      retryable: true,
    });
  }
  const owner = await resolvePlayPurchaseOwner(deps.store, sub);
  const uid = owner.uid;
  const diagnosticUid = deps.diagnosticUidFor(uid);

  const order = await deps.play.getOrder(orderId);
  assertPackageName(order.packageName, packageName);
  const productOk =
    !order.lineItems ||
    order.lineItems.length === 0 ||
    order.lineItems.some((item) => item.productId === catalog.productId);
  if (!productOk) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "order_product_mismatch",
    });
  }
  const grossAmountInPaise = googlePaidOrderTotalToPaise(order.total);

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
  const original =
    (await readLedger(deps.store, purchaseLedgerId)) ??
    (await readLedger(deps.store, renewalLedgerId));
  if (!original) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "missing_original_financial_event",
      retryable: true,
    });
  }

  const fp = credentialFingerprint(purchaseToken);
  const encrypted = await deps.cipher.encryptCredential(purchaseToken);
  const currentPeriodEnd = parseRfc3339Millis(lineItem.expiryTime, "invalid_expiry_time");
  const state = sub.subscriptionState ?? "";
  const retainAccess = state === "SUBSCRIPTION_STATE_ACTIVE";

  const platformEvent: VerifiedPlatformEvent = {
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    productId: catalog.productId,
    basePlanId: catalog.basePlanId,
    currentPeriodStart: null,
    currentPeriodEnd,
    autoRenewing: false,
    latestOrderId: orderId,
    originalTransactionId: null,
    credentialFingerprint: fp,
    encryptedPurchaseCredential: encrypted,
    reconciledAt,
  };

  const refundOccurredAt =
    parseRfc3339MillisOrNull(order.createTime, "invalid_order_create_time") ?? original.occurredAt;

  const financial: VerifiedFinancialEvent = {
    financialEventId: financialEventIdForStore({
      platform: "android",
      eventType: "refund",
      orderId,
    }),
    eventType: "refund",
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    grossAmountInPaise,
    actualPlatformCommissionInPaise: null,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: refundOccurredAt,
    relatedFinancialEventId: original.financialEventId,
  };

  let kind: CanonicalTransitionKind;
  if (retainAccess) {
    kind = "recordFinancial";
  } else if (state === "SUBSCRIPTION_STATE_CANCELED") {
    kind = "cancel";
  } else if (state === "SUBSCRIPTION_STATE_ON_HOLD" || state === "SUBSCRIPTION_STATE_PAUSED") {
    kind = "enterOnHold";
  } else {
    kind = "expire";
  }

  const applyResult = await applySubscriptionTransition(
    { store: deps.store, diagnosticUid },
    {
      uid,
      source: input.source,
      eventSource: "webhook",
      idempotencyKey: `android:refund:${orderId}:webhook`,
      occurredAt: refundOccurredAt,
      nowMs: reconciledAt,
      requested: {
        kind,
        plan: getCatalogEntry(catalog.canonicalSku).plan,
        platformEvent,
        financialEvent: financial,
        googleSubscriptionState: state,
      },
    }
  );

  await invokeTaxHandoff(deps, uid, financial, applyResult);

  billingLog("info", {
    diagnosticUid,
    platform: "android",
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
    orderId,
    result: applyResult.alreadyProcessed ? "already_processed" : "ok",
    eventType: "refund",
  });

  return {
    alreadyProcessed: applyResult.alreadyProcessed,
    financialEventWritten: applyResult.financialEventWritten,
    historyWritten: applyResult.historyWritten,
    acknowledged: false,
    skipped: null,
    uid,
    diagnosticUid,
    resultSummary: applyResult.resultSummary,
    to: applyResult.to,
    canonicalSku: catalog.canonicalSku,
    googleSubscriptionState: state,
  };
}
