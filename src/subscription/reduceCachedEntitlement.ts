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

/**
 * Applicable offline/cache expiry boundary. `null` means already non-access
 * (onHold / expired) or no timestamp to watch. Does not invent a later expiry.
 */
export function entitlementExpiryBoundaryMs(status: ClientSubscriptionStatus): number | null {
  if (!status.entitlementActive) return null;
  switch (status.billingStatus) {
    case "trial":
      return typeof status.trialEndsAt === "number" && Number.isFinite(status.trialEndsAt)
        ? status.trialEndsAt
        : null;
    case "active":
    case "cancelled":
      return typeof status.currentPeriodEnd === "number" && Number.isFinite(status.currentPeriodEnd)
        ? status.currentPeriodEnd
        : null;
    case "grace":
      return typeof status.gracePeriodEndsAt === "number" && Number.isFinite(status.gracePeriodEndsAt)
        ? status.gracePeriodEndsAt
        : null;
    case "onHold":
    case "expired":
    default:
      return null;
  }
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
