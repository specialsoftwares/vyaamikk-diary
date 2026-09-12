/**
 * Canonical subscription transition model (pure).
 *
 * Google/Apple parsing stays OUT of this module. Callers pass a verified
 * platform event (or a trial/admin request). Persistence is a separate step.
 */

import { createHash } from "node:crypto";

import { deriveEntitlement, neverSubscribedEntitlement } from "./deriveEntitlement";
import { BillingError } from "./errors";
import { istMonthKeyForMillis } from "./istMonthKey";
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

function paidPlan(value: VyaamikkPlan | undefined, sku: string | undefined): VyaamikkPlan {
  if (value && PAID.has(value)) return value;
  if (sku?.includes("business")) return "business";
  if (sku?.includes("professional")) return "professional";
  if (sku?.includes("starter")) return "starter";
  throw new BillingError({
    clientCode: "invalid_purchase",
    causeCode: "unknown_plan_fail_closed",
  });
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

function fingerprint(req: TransitionRequest): string {
  const r = req.requested;
  const payload = JSON.stringify({
    kind: r.kind,
    plan: r.plan ?? null,
    sku: r.platformEvent?.canonicalSku ?? r.financialEvent?.canonicalSku ?? null,
    periodEnd: r.platformEvent?.currentPeriodEnd ?? null,
    financialEventId: r.financialEvent?.financialEventId ?? null,
    financialType: r.financialEvent?.eventType ?? null,
    accessRevoked: r.accessRevoked === true,
    source: req.source,
    eventSource: req.eventSource,
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

  let historyType: BillingHistoryEventDoc["type"] | null = requested.historyType ?? null;
  const sku = requested.platformEvent?.canonicalSku ?? requested.financialEvent?.canonicalSku ?? null;
  const amount = requested.financialEvent?.grossAmountInPaise ?? null;

  switch (requested.kind) {
    case "grantTrial": {
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
      const plan = paidPlan(requested.plan, requested.platformEvent?.canonicalSku);
      next.plan = plan;
      next.billingStatus = "active";
      next.cancelledAt = null;
      next.gracePeriodEndsAt = null;
      Object.assign(next, platformFields(requested.platformEvent));
      historyType = requested.kind === "renew" ? "renewed" : "purchaseActivated";
      break;
    }
    case "enterGrace": {
      next.billingStatus = "grace";
      next.gracePeriodEndsAt = requested.gracePeriodEndsAt ?? next.gracePeriodEndsAt;
      Object.assign(next, platformFields(requested.platformEvent));
      if (requested.plan && PAID.has(requested.plan)) next.plan = requested.plan;
      historyType = "graceEntered";
      break;
    }
    case "enterOnHold": {
      next.billingStatus = "onHold";
      next.autoRenewing = false;
      Object.assign(next, platformFields(requested.platformEvent));
      historyType = "onHoldEntered";
      break;
    }
    case "cancel": {
      next.billingStatus = "cancelled";
      next.cancelledAt = requested.cancelledAt ?? occurredAt;
      next.autoRenewing = false;
      Object.assign(next, platformFields(requested.platformEvent));
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
    case "adminGrant": {
      if (!requested.plan || requested.plan === "free" || !PAID.has(requested.plan)) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "admin_grant_unknown_plan",
        });
      }
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

export function financialEventIdForStore(opts: {
  platform: BillingPlatform;
  orderId?: string | null;
  transactionId?: string | null;
}): string {
  if (opts.platform === "android") {
    if (!opts.orderId) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "missing_android_order_id",
      });
    }
    return `android:${opts.orderId}`;
  }
  if (!opts.transactionId) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "missing_ios_transaction_id",
    });
  }
  return `ios:${opts.transactionId}`;
}
