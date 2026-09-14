/**
 * Offline-cache timestamp reduction.
 *
 * Device time may only SHORTEN stale cached access. It must never manufacture
 * a later expiry or grant entitlement the cache did not already carry.
 *
 * Cache is UX continuity, never authority for writes, quota, purchase,
 * financial state, restoration, or tax/invoice eligibility.
 */

import { DEFAULT_CLIENT_SUBSCRIPTION, type ClientSubscriptionStatus } from "./types";

function inFuture(ts: number | null, nowMs: number): ts is number {
  return typeof ts === "number" && Number.isFinite(ts) && ts > nowMs;
}

function revokeToFree(
  status: ClientSubscriptionStatus,
  reason: ClientSubscriptionStatus["entitlementReason"]
): ClientSubscriptionStatus {
  return {
    ...status,
    plan: "free",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: reason,
    autoRenewing: false,
    scheduledPlan: null,
    quotaEnforcementEnabled: false,
  };
}

export function reduceCachedEntitlement(
  status: ClientSubscriptionStatus,
  nowMs: number
): { status: ClientSubscriptionStatus; reduced: boolean } {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    return { status: { ...DEFAULT_CLIENT_SUBSCRIPTION }, reduced: true };
  }

  if (!status.entitlementActive) {
    return { status, reduced: false };
  }

  switch (status.billingStatus) {
    case "trial": {
      if (!inFuture(status.trialEndsAt, nowMs)) {
        return { status: revokeToFree(status, "trialExpired"), reduced: true };
      }
      return { status, reduced: false };
    }
    case "active":
    case "cancelled": {
      if (!inFuture(status.currentPeriodEnd, nowMs)) {
        return { status: revokeToFree(status, "subscriptionExpired"), reduced: true };
      }
      return { status, reduced: false };
    }
    case "grace": {
      if (!inFuture(status.gracePeriodEndsAt, nowMs)) {
        return { status: revokeToFree(status, "subscriptionExpired"), reduced: true };
      }
      return { status, reduced: false };
    }
    case "onHold":
      return { status: revokeToFree(status, "onHoldAccessRevoked"), reduced: true };
    case "expired":
    default:
      return { status: revokeToFree(status, "subscriptionExpired"), reduced: true };
  }
}
