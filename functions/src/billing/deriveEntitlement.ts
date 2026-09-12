/**
 * Pure entitlement derivation. Billing lifecycle status is NOT access.
 *
 * Clock is an explicit `nowMs` argument — this module never calls Date.now().
 * Unknown/malformed status or plan FAIL CLOSED to free / not entitled.
 */

import {
  TRIAL_PLAN,
  type BillingLifecycleStatus,
  type EntitlementReason,
  type VyaamikkPlan,
} from "./types";

const PLANS: ReadonlySet<string> = new Set(["free", "starter", "professional", "business"]);
const STATUSES: ReadonlySet<string> = new Set([
  "trial",
  "active",
  "grace",
  "onHold",
  "cancelled",
  "expired",
]);
const PAID_PLANS: ReadonlySet<string> = new Set(["starter", "professional", "business"]);

export interface EntitlementSnapshot {
  billingStatus: unknown;
  plan: unknown;
  trialEndsAt?: number | null;
  currentPeriodEnd?: number | null;
  gracePeriodEndsAt?: number | null;
  /** Authoritative refund/revocation: immediate access removal. */
  accessRevoked?: boolean;
  /**
   * Only consulted when billingStatus is grace AND the grace window has ended.
   * Default false — "unless verified platform state says otherwise".
   */
  verifiedPlatformAccessActive?: boolean;
  /**
   * Future platform mapping hook. Default false: onHold revokes access.
   * Must not be set by clients.
   */
  onHoldRetainsAccess?: boolean;
}

export interface DerivedEntitlement {
  plan: VyaamikkPlan;
  billingStatus: BillingLifecycleStatus;
  entitlementActive: boolean;
  entitlementReason: EntitlementReason;
}

const EXPIRED_FREE: DerivedEntitlement = {
  plan: "free",
  billingStatus: "expired",
  entitlementActive: false,
  entitlementReason: "subscriptionExpired",
};

function isPlan(value: unknown): value is VyaamikkPlan {
  return typeof value === "string" && PLANS.has(value);
}

function isPaidPlan(value: unknown): value is Exclude<VyaamikkPlan, "free"> {
  return typeof value === "string" && PAID_PLANS.has(value);
}

function isStatus(value: unknown): value is BillingLifecycleStatus {
  return typeof value === "string" && STATUSES.has(value);
}

function inFuture(ts: unknown, nowMs: number): ts is number {
  return typeof ts === "number" && Number.isFinite(ts) && ts > nowMs;
}

export function deriveEntitlement(input: EntitlementSnapshot, nowMs: number): DerivedEntitlement {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    return EXPIRED_FREE;
  }

  if (input.accessRevoked === true) {
    return EXPIRED_FREE;
  }

  if (!isStatus(input.billingStatus)) {
    return EXPIRED_FREE;
  }

  switch (input.billingStatus) {
    case "trial": {
      if (!inFuture(input.trialEndsAt, nowMs)) {
        return {
          plan: "free",
          billingStatus: "expired",
          entitlementActive: false,
          entitlementReason: "trialExpired",
        };
      }
      return {
        plan: TRIAL_PLAN,
        billingStatus: "trial",
        entitlementActive: true,
        entitlementReason: "trialActive",
      };
    }
    case "active": {
      if (!isPaidPlan(input.plan) || !inFuture(input.currentPeriodEnd, nowMs)) {
        return EXPIRED_FREE;
      }
      return {
        plan: input.plan,
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "storeSubscriptionActive",
      };
    }
    case "cancelled": {
      if (!isPaidPlan(input.plan) || !inFuture(input.currentPeriodEnd, nowMs)) {
        return EXPIRED_FREE;
      }
      return {
        plan: input.plan,
        billingStatus: "cancelled",
        entitlementActive: true,
        entitlementReason: "cancelledPeriodRemaining",
      };
    }
    case "grace": {
      if (!isPaidPlan(input.plan)) {
        return EXPIRED_FREE;
      }
      if (inFuture(input.gracePeriodEndsAt, nowMs)) {
        return {
          plan: input.plan,
          billingStatus: "grace",
          entitlementActive: true,
          entitlementReason: "graceRetained",
        };
      }
      if (input.verifiedPlatformAccessActive === true && inFuture(input.currentPeriodEnd, nowMs)) {
        return {
          plan: input.plan,
          billingStatus: "grace",
          entitlementActive: true,
          entitlementReason: "graceRetained",
        };
      }
      return EXPIRED_FREE;
    }
    case "onHold": {
      if (
        input.onHoldRetainsAccess === true &&
        isPaidPlan(input.plan) &&
        inFuture(input.currentPeriodEnd, nowMs)
      ) {
        return {
          plan: input.plan,
          billingStatus: "onHold",
          entitlementActive: true,
          entitlementReason: "storeSubscriptionActive",
        };
      }
      return {
        plan: isPaidPlan(input.plan) ? input.plan : "free",
        billingStatus: "onHold",
        entitlementActive: false,
        entitlementReason: "onHoldAccessRevoked",
      };
    }
    case "expired":
      return EXPIRED_FREE;
    default:
      return EXPIRED_FREE;
  }
}

export function neverSubscribedEntitlement(): DerivedEntitlement {
  return {
    plan: "free",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "neverSubscribed",
  };
}

export function isVyaamikkPlan(value: unknown): value is VyaamikkPlan {
  return isPlan(value);
}
