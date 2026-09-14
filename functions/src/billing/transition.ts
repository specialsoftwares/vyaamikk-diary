/**
 * Canonical subscription transition model (pure).
 *
 * Google/Apple parsing stays OUT of this module. Callers pass a verified
 * platform event (or a trial/admin request). Persistence is a separate step.
 *
 * OUT-OF-ORDER EVENT SAFETY (owner-reviewed contract):
 * Platform adapters (Phase C Android / Phase D iOS) MUST reconcile to the
 * CURRENT authoritative store state (e.g. purchases.subscriptionsv2.get /
 * App Store signed transaction info) before invoking this engine, and MUST
 * stamp `VerifiedPlatformEvent.reconciledAt` with the moment that state was
 * fetched. Adapters never feed raw historical webhook payloads directly into
 * the engine. As defense in depth, the persistence layer additionally
 * rejects platform-sourced transitions whose `reconciledAt` is OLDER than
 * the `lastReconciledAt` watermark already stored in `_companyBilling`
 * (see applyTransition.ts). Both layers fail closed.
 */

import { createHash } from "node:crypto";

import { deriveEntitlement, neverSubscribedEntitlement } from "./deriveEntitlement";
import { BillingError } from "./errors";
import { istMonthKeyForMillis } from "./istMonthKey";
import { SUBSCRIPTION_CATALOG, type CatalogEntry } from "./products";
import { TRIAL_DURATION_DAYS, TRIAL_PLAN, type BillingHistoryEventDoc } from "./types";
import type {
  BillingEventLedgerDoc,
  BillingMutationSource,
  BillingPlatform,
  EncryptedPurchaseCredential,
  FinancialEventType,
  SubscriptionStatusDoc,
  VyaamikkPlan,
} from "./types";

export type CanonicalTransitionKind =
  | "grantTrial"
  | "activatePaid"
  | "renew"
  | "enterGrace"
  | "enterOnHold"
  | "cancel"
  | "expire"
  | "refund"
  | "recordFinancial"
  | "adminGrant";

export interface VerifiedPlatformEvent {
  platform: BillingPlatform;
  canonicalSku: string;
  productId: string;
  basePlanId: string | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  autoRenewing: boolean;
  latestOrderId: string | null;
  originalTransactionId: string | null;
  credentialFingerprint: string | null;
  /** Must already be encrypted — never pass a raw purchase token here. */
  encryptedPurchaseCredential: EncryptedPurchaseCredential | null;
  /**
   * SHA-256 of Google `linkedPurchaseToken` when a replacement token is
   * verified. Never the raw linked token. Persistence appends this to
   * `_companyBilling.invalidatedCredentialFingerprints`.
   */
  linkedCredentialFingerprint?: string | null;
  /**
   * REQUIRED CONTRACT (stale-event safety): epoch ms at which the adapter
   * fetched the CURRENT authoritative subscription state from the platform.
   * Adapters must reconcile webhook/callable triggers against live store
   * state before building this event; the engine fails closed when this is
   * missing and the persistence layer rejects values older than the stored
   * `_companyBilling.lastReconciledAt` watermark.
   */
  reconciledAt: number;
}

export interface VerifiedFinancialEvent {
  financialEventId: string;
  eventType: FinancialEventType;
  platform: BillingPlatform;
  canonicalSku: string;
  grossAmountInPaise: number;
  actualPlatformCommissionInPaise: number | null;
  estimatedPlatformCommissionInPaise: number | null;
  occurredAt: number;
  /**
   * Refund/chargeback → original purchase/renewal financialEventId.
   * Purchase/renewal must be null.
   */
  relatedFinancialEventId: string | null;
}

export interface CanonicalTransition {
  kind: CanonicalTransitionKind;
  plan?: VyaamikkPlan;
  platformEvent?: VerifiedPlatformEvent;
  financialEvent?: VerifiedFinancialEvent;
  cancelledAt?: number;
  gracePeriodEndsAt?: number;
  accessRevoked?: boolean;
  historyType?: BillingHistoryEventDoc["type"];
  /**
   * Sanitized Google subscriptionState (e.g. SUBSCRIPTION_STATE_PAUSED).
   * Diagnostic/audit only — never a credential. Lets a future Subscription
   * screen distinguish paused vs account hold while Phase C maps PAUSED to
   * existing enterOnHold / no-access semantics.
   */
  googleSubscriptionState?: string | null;
}

export interface TransitionRequest {
  uid: string;
  source: BillingMutationSource;
  eventSource: "callable" | "webhook" | "scheduler" | "admin" | "trial";
  idempotencyKey: string;
  occurredAt: number;
  nowMs: number;
  requested: CanonicalTransition;
}

export interface DerivedTransition {
  next: SubscriptionStatusDoc;
  history: BillingHistoryEventDoc | null;
  ledger: BillingEventLedgerDoc | null;
  requestFingerprint: string;
  resultSummary: string;
}

const PAID: ReadonlySet<VyaamikkPlan> = new Set(["starter", "professional", "business"]);

function catalogEntryOrNull(sku: string): CatalogEntry | null {
  return (SUBSCRIPTION_CATALOG as Record<string, CatalogEntry | undefined>)[sku] ?? null;
}

/**
 * Resolve a platform event's SKU against the EXACT Phase-A catalog.
 * No substring inference: unknown SKUs are rejected, and a known SKU whose
 * plan conflicts with the requested plan is rejected (never silently prefer
 * either side). Product/basePlan identifiers must match the catalog mapping.
 */
function resolveCatalogEntry(
  ev: VerifiedPlatformEvent,
  requestedPlan: VyaamikkPlan | undefined
): CatalogEntry {
  const entry = catalogEntryOrNull(ev.canonicalSku);
  if (!entry) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_canonical_sku",
    });
  }
  const productMatches =
    ev.platform === "android"
      ? ev.productId === entry.android.productId &&
        (ev.basePlanId === null || ev.basePlanId === entry.android.basePlanId)
      : ev.productId === entry.ios.productId;
  if (!productMatches) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "sku_product_mismatch",
    });
  }
  if (requestedPlan !== undefined && requestedPlan !== entry.plan) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "sku_plan_mismatch",
    });
  }
  return entry;
}

function assertKnownFinancialSku(sku: string): void {
  if (!catalogEntryOrNull(sku)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_canonical_sku",
    });
  }
}

function assertReconciled(ev: VerifiedPlatformEvent): void {
  if (typeof ev.reconciledAt !== "number" || !Number.isFinite(ev.reconciledAt)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "platform_event_not_reconciled",
    });
  }
}

/**
 * Trial eligibility (owner rule: "first account trial", trial must NEVER
 * replace paid access). Eligible prior states are ONLY:
 * - no prior subscription status document, or
 * - an explicit server-created never-subscribed/unentitled state with no
 *   current or historic paid platform ownership.
 * Anything else — active/grace/cancelled-but-period-active paid states,
 * an existing or expired trial, or an expired historical paid subscription —
 * is rejected fail-closed.
 */
export function isTrialEligiblePriorState(prior: SubscriptionStatusDoc | null): boolean {
  if (prior === null) return true;
  return (
    prior.plan === "free" &&
    prior.entitlementActive === false &&
    prior.entitlementReason === "neverSubscribed" &&
    prior.billingStatus === "expired" &&
    prior.platform === null &&
    prior.productId === null &&
    prior.trialStartedAt === null &&
    prior.trialEndsAt === null &&
    prior.currentPeriodEnd === null
  );
}

function baseStatus(
  prior: SubscriptionStatusDoc | null,
  source: BillingMutationSource,
  nowMs: number
): SubscriptionStatusDoc {
  const empty = neverSubscribedEntitlement();
  return {
    plan: empty.plan,
    billingStatus: empty.billingStatus,
    entitlementActive: empty.entitlementActive,
    entitlementReason: empty.entitlementReason,
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    platform: null,
    productId: null,
    basePlanId: null,
    autoRenewing: false,
    cancelledAt: null,
    gracePeriodEndsAt: null,
    scheduledPlan: null,
    quotaEnforcementEnabled: prior?.quotaEnforcementEnabled === true,
    updatedAt: nowMs,
    updatedBy: source,
  };
}

function applyDerived(next: SubscriptionStatusDoc, nowMs: number): SubscriptionStatusDoc {
  const derived = deriveEntitlement(
    {
      billingStatus: next.billingStatus,
      plan: next.plan,
      trialEndsAt: next.trialEndsAt,
      currentPeriodEnd: next.currentPeriodEnd,
      gracePeriodEndsAt: next.gracePeriodEndsAt,
      accessRevoked: next.billingStatus === "expired" && next.entitlementReason === "subscriptionExpired"
        ? false
        : undefined,
    },
    nowMs
  );
  return {
    ...next,
    plan: derived.plan,
    billingStatus: derived.billingStatus,
    entitlementActive: derived.entitlementActive,
    entitlementReason: derived.entitlementReason,
  };
}

function platformFields(ev: VerifiedPlatformEvent | undefined): Partial<SubscriptionStatusDoc> {
  if (!ev) return {};
  return {
    platform: ev.platform,
    productId: ev.productId,
    basePlanId: ev.basePlanId,
    currentPeriodStart: ev.currentPeriodStart,
    currentPeriodEnd: ev.currentPeriodEnd,
    autoRenewing: ev.autoRenewing,
  };
}

/**
 * Canonical idempotency fingerprint.
 *
 * Covers the COMPLETE semantic payload of the transition so a replayed
 * idempotency key carrying different semantics (different amount, uid, base
 * plan, period end, grace end, …) is detected as a conflict and fails
 * closed.
 *
 * Deliberately EXCLUDED:
 * - `nowMs` and `reconciledAt`: processing/retry timestamps — a legitimate
 *   retry of the same semantic event arrives later and must stay idempotent.
 * - `encryptedPurchaseCredential`: AES-GCM ciphertext is randomized per
 *   encryption; the deterministic `credentialFingerprint` covers the
 *   credential identity instead.
 *
 * Key order in the literals below is fixed → JSON.stringify is a
 * deterministic canonical serialization.
 */
function fingerprint(req: TransitionRequest): string {
  const r = req.requested;
  const p = r.platformEvent;
  const f = r.financialEvent;
  const payload = JSON.stringify({
    v: 2,
    uid: req.uid,
    source: req.source,
    eventSource: req.eventSource,
    occurredAt: req.occurredAt,
    kind: r.kind,
    plan: r.plan ?? null,
    cancelledAt: r.cancelledAt ?? null,
    gracePeriodEndsAt: r.gracePeriodEndsAt ?? null,
    accessRevoked: r.accessRevoked === true,
    historyType: r.historyType ?? null,
    platformEvent: p
      ? {
          platform: p.platform,
          canonicalSku: p.canonicalSku,
          productId: p.productId,
          basePlanId: p.basePlanId,
          currentPeriodStart: p.currentPeriodStart,
          currentPeriodEnd: p.currentPeriodEnd,
          autoRenewing: p.autoRenewing,
          latestOrderId: p.latestOrderId,
          originalTransactionId: p.originalTransactionId,
          credentialFingerprint: p.credentialFingerprint,
          linkedCredentialFingerprint: p.linkedCredentialFingerprint ?? null,
        }
      : null,
    googleSubscriptionState: r.googleSubscriptionState ?? null,
    financialEvent: f
      ? {
          financialEventId: f.financialEventId,
          eventType: f.eventType,
          platform: f.platform,
          canonicalSku: f.canonicalSku,
          grossAmountInPaise: f.grossAmountInPaise,
          actualPlatformCommissionInPaise: f.actualPlatformCommissionInPaise,
          estimatedPlatformCommissionInPaise: f.estimatedPlatformCommissionInPaise,
          occurredAt: f.occurredAt,
          relatedFinancialEventId: f.relatedFinancialEventId ?? null,
        }
      : null,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function historyEvent(
  type: BillingHistoryEventDoc["type"],
  next: SubscriptionStatusDoc,
  occurredAt: number,
  sku: string | null,
  amount: number | null
): BillingHistoryEventDoc {
  return {
    type,
    occurredAt,
    planAfter: next.plan,
    billingStatusAfter: next.billingStatus,
    platform: next.platform,
    canonicalSku: sku,
    amountInPaise: amount,
    currency: amount == null ? null : "INR",
  };
}

function ledgerFrom(
  uid: string,
  source: BillingMutationSource,
  nowMs: number,
  fin: VerifiedFinancialEvent
): BillingEventLedgerDoc {
  if (!Number.isInteger(fin.grossAmountInPaise) || fin.grossAmountInPaise < 0) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "non_integer_paise",
    });
  }
  assertKnownFinancialSku(fin.canonicalSku);
  const related = fin.relatedFinancialEventId ?? null;
  if (fin.eventType === "purchase" || fin.eventType === "renewal") {
    if (related != null) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "related_financial_event_not_allowed",
      });
    }
  } else if (fin.eventType === "refund" || fin.eventType === "chargeback") {
    if (!related) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "missing_related_financial_event",
      });
    }
  } else {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_financial_event_type",
    });
  }
  return {
    financialEventId: fin.financialEventId,
    platform: fin.platform,
    uid,
    canonicalSku: fin.canonicalSku,
    eventType: fin.eventType,
    grossAmountInPaise: fin.grossAmountInPaise,
    currency: "INR",
    actualPlatformCommissionInPaise: fin.actualPlatformCommissionInPaise,
    estimatedPlatformCommissionInPaise: fin.estimatedPlatformCommissionInPaise,
    occurredAt: fin.occurredAt,
    monthKey: istMonthKeyForMillis(fin.occurredAt),
    relatedFinancialEventId: related,
    recordedAt: nowMs,
    recordedBy: source,
  };
}

export function deriveSubscriptionTransition(
  prior: SubscriptionStatusDoc | null,
  req: TransitionRequest
): DerivedTransition {
  const { nowMs, source, occurredAt, requested } = req;
  let next = { ...baseStatus(prior, source, nowMs) };
  if (prior) {
    next = {
      ...prior,
      updatedAt: nowMs,
      updatedBy: source,
    };
  }

  if (requested.platformEvent) {
    assertReconciled(requested.platformEvent);
  }

  let historyType: BillingHistoryEventDoc["type"] | null = requested.historyType ?? null;
  const sku = requested.platformEvent?.canonicalSku ?? requested.financialEvent?.canonicalSku ?? null;
  const amount = requested.financialEvent?.grossAmountInPaise ?? null;

  switch (requested.kind) {
    case "grantTrial": {
      if (!isTrialEligiblePriorState(prior)) {
        throw new BillingError({
          clientCode: "not_entitled",
          causeCode: "trial_prior_state_ineligible",
        });
      }
      next.plan = TRIAL_PLAN;
      next.billingStatus = "trial";
      next.trialStartedAt = occurredAt;
      next.trialEndsAt = occurredAt + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
      next.currentPeriodStart = next.trialStartedAt;
      next.currentPeriodEnd = next.trialEndsAt;
      next.platform = null;
      next.productId = null;
      next.basePlanId = null;
      next.autoRenewing = false;
      next.cancelledAt = null;
      next.gracePeriodEndsAt = null;
      next.scheduledPlan = null;
      historyType = "trialStarted";
      break;
    }
    case "activatePaid":
    case "renew": {
      if (!requested.platformEvent) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "missing_platform_event",
        });
      }
      const entry = resolveCatalogEntry(requested.platformEvent, requested.plan);
      next.plan = entry.plan;
      next.billingStatus = "active";
      next.cancelledAt = null;
      next.gracePeriodEndsAt = null;
      Object.assign(next, platformFields(requested.platformEvent));
      historyType = requested.kind === "renew" ? "renewed" : "purchaseActivated";
      break;
    }
    case "enterGrace": {
      const entry = requested.platformEvent
        ? resolveCatalogEntry(requested.platformEvent, requested.plan)
        : null;
      next.billingStatus = "grace";
      next.gracePeriodEndsAt = requested.gracePeriodEndsAt ?? next.gracePeriodEndsAt;
      Object.assign(next, platformFields(requested.platformEvent));
      if (entry) next.plan = entry.plan;
      else if (requested.plan && PAID.has(requested.plan)) next.plan = requested.plan;
      historyType = "graceEntered";
      break;
    }
    case "enterOnHold": {
      const entry = requested.platformEvent
        ? resolveCatalogEntry(requested.platformEvent, requested.plan)
        : null;
      next.billingStatus = "onHold";
      next.autoRenewing = false;
      Object.assign(next, platformFields(requested.platformEvent));
      if (entry) next.plan = entry.plan;
      else if (requested.plan && PAID.has(requested.plan)) next.plan = requested.plan;
      historyType = "onHoldEntered";
      break;
    }
    case "cancel": {
      const entry = requested.platformEvent
        ? resolveCatalogEntry(requested.platformEvent, requested.plan)
        : null;
      next.billingStatus = "cancelled";
      next.cancelledAt = requested.cancelledAt ?? occurredAt;
      next.autoRenewing = false;
      Object.assign(next, platformFields(requested.platformEvent));
      if (entry) next.plan = entry.plan;
      else if (requested.plan && PAID.has(requested.plan)) next.plan = requested.plan;
      historyType = "cancelled";
      break;
    }
    case "expire": {
      next.billingStatus = "expired";
      next.autoRenewing = false;
      historyType = "expired";
      break;
    }
    case "refund": {
      next.billingStatus = "expired";
      next.autoRenewing = false;
      next.currentPeriodEnd = occurredAt;
      historyType = "refunded";
      break;
    }
    case "recordFinancial": {
      // Financial-event-only / reconciliation path (VYD-32): a Google refund
      // is NOT automatically a revocation. Live subscription state decides
      // access; this kind writes the ledger (and optional watermark) without
      // forcing expiry. Do not use `kind: refund` for refund-without-revoke.
      //
      // `prior === null` is allowed in the fingerprint preview (applyTransition
      // always derives once with prior=null). Persistence rejects a real
      // apply with no status document.
      if (!requested.financialEvent) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "missing_financial_event",
        });
      }
      if (requested.platformEvent) {
        resolveCatalogEntry(requested.platformEvent, requested.plan);
        if (prior) Object.assign(next, platformFields(requested.platformEvent));
      }
      if (!historyType) {
        historyType =
          requested.financialEvent.eventType === "refund" ? "refunded" : null;
      }
      break;
    }
    case "adminGrant": {
      if (!requested.plan || requested.plan === "free" || !PAID.has(requested.plan)) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "admin_grant_unknown_plan",
        });
      }
      if (requested.platformEvent) resolveCatalogEntry(requested.platformEvent, requested.plan);
      next.plan = requested.plan;
      next.billingStatus = "active";
      next.entitlementReason = "adminGrant";
      Object.assign(next, platformFields(requested.platformEvent));
      historyType = "planChanged";
      break;
    }
    default: {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "unknown_transition_kind",
      });
    }
  }

  if (requested.kind === "refund") {
    const derived = deriveEntitlement(
      {
        billingStatus: "expired",
        plan: "free",
        accessRevoked: true,
      },
      nowMs
    );
    next = {
      ...next,
      ...derived,
      updatedAt: nowMs,
      updatedBy: source,
    };
  } else if (requested.kind === "adminGrant") {
    const derived = deriveEntitlement(
      {
        billingStatus: next.billingStatus,
        plan: next.plan,
        currentPeriodEnd: next.currentPeriodEnd,
        trialEndsAt: next.trialEndsAt,
        gracePeriodEndsAt: next.gracePeriodEndsAt,
      },
      nowMs
    );
    next = {
      ...next,
      plan: derived.plan,
      billingStatus: derived.billingStatus,
      entitlementActive: derived.entitlementActive,
      entitlementReason: derived.entitlementActive ? "adminGrant" : derived.entitlementReason,
      updatedAt: nowMs,
      updatedBy: source,
    };
  } else {
    next = applyDerived(next, nowMs);
  }

  const history = historyType
    ? historyEvent(historyType, next, occurredAt, sku, amount)
    : null;

  const ledger = requested.financialEvent
    ? ledgerFrom(req.uid, source, nowMs, requested.financialEvent)
    : null;

  return {
    next,
    history,
    ledger,
    requestFingerprint: fingerprint(req),
    resultSummary: `${next.billingStatus}:${next.plan}:${next.entitlementActive ? "1" : "0"}`,
  };
}

const FINANCIAL_EVENT_CLASSES: ReadonlySet<FinancialEventType> = new Set([
  "purchase",
  "renewal",
  "refund",
  "chargeback",
]);

/**
 * Deterministic Firestore-safe financial ledger document id.
 *
 * The EVENT CLASS is part of the identity: a purchase and a later refund of
 * the SAME store transaction are distinct financial events and must coexist
 * as separate ledger rows (`android:purchase:{id}` vs `android:refund:{id}`),
 * while a duplicate delivery of the same class stays deduplicated. Refunds
 * do NOT need a fresh store transaction id.
 *
 * Refund vs chargeback of the SAME Google Order are mutually exclusive
 * (see oppositeAndroidFullReversalFinancialEventId). Their ids differ by
 * eventType, so ordinary same-row idempotency cannot collide them.
 */
export function financialEventIdForStore(opts: {
  platform: BillingPlatform;
  eventType: FinancialEventType;
  orderId?: string | null;
  transactionId?: string | null;
}): string {
  if (!FINANCIAL_EVENT_CLASSES.has(opts.eventType)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unknown_financial_event_type",
    });
  }
  if (opts.platform === "android") {
    if (!opts.orderId) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "missing_android_order_id",
      });
    }
    return `android:${opts.eventType}:${opts.orderId.replace(/\//g, "_")}`;
  }
  if (!opts.transactionId) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "missing_ios_transaction_id",
    });
  }
  return `ios:${opts.eventType}:${opts.transactionId.replace(/\//g, "_")}`;
}

/**
 * Opposite full-reversal ledger id for one Google Order.
 *
 * `android:refund:{order}` ↔ `android:chargeback:{order}`.
 * Purchase/renewal and non-Android events return null (no extra read).
 */
export function oppositeAndroidFullReversalFinancialEventId(
  financialEventId: string,
  eventType: FinancialEventType,
  platform: BillingPlatform
): string | null {
  if (platform !== "android") return null;
  if (eventType !== "refund" && eventType !== "chargeback") return null;
  const prefix = `android:${eventType}:`;
  if (!financialEventId.startsWith(prefix)) return null;
  const orderPart = financialEventId.slice(prefix.length);
  if (orderPart.length === 0) return null;
  const opposite = eventType === "refund" ? "chargeback" : "refund";
  return `android:${opposite}:${orderPart}`;
}
