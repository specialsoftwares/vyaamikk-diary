/**
 * Fail-closed parser for `users/{uid}/subscription/status`.
 *
 * Never throws. Malformed/unknown enums become a free, non-entitled status
 * so app startup cannot crash on a bad document.
 */

import {
  BILLING_LIFECYCLE_STATUSES,
  DEFAULT_CLIENT_SUBSCRIPTION,
  ENTITLEMENT_REASONS,
  VYAAMIKK_PLANS,
  type BillingLifecycleStatus,
  type BillingPlatform,
  type ClientSubscriptionStatus,
  type EntitlementReason,
  type VyaamikkPlan,
} from "./types";

const PLANS = new Set<string>(VYAAMIKK_PLANS);
const STATUSES = new Set<string>(BILLING_LIFECYCLE_STATUSES);
const REASONS = new Set<string>(ENTITLEMENT_REASONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function millisOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asPlan(value: unknown): VyaamikkPlan | null {
  return typeof value === "string" && PLANS.has(value) ? (value as VyaamikkPlan) : null;
}

function asStatus(value: unknown): BillingLifecycleStatus | null {
  return typeof value === "string" && STATUSES.has(value)
    ? (value as BillingLifecycleStatus)
    : null;
}

function asReason(value: unknown): EntitlementReason | null {
  return typeof value === "string" && REASONS.has(value) ? (value as EntitlementReason) : null;
}

function asPlatform(value: unknown): BillingPlatform | null {
  return value === "android" || value === "ios" ? value : null;
}

/**
 * Normalize a server (or cached) document. Additive unknown fields are ignored.
 *
 * Unknown plan → `free` for client feature access.
 * Unknown / non-access billing status → no paid entitlement.
 */
export function parseSubscriptionStatus(raw: unknown): ClientSubscriptionStatus {
  try {
    if (!isRecord(raw)) {
      return { ...DEFAULT_CLIENT_SUBSCRIPTION };
    }

    const billingStatus = asStatus(raw.billingStatus);
    const plan = asPlan(raw.plan) ?? "free";
    const entitlementActive = raw.entitlementActive === true && billingStatus != null;

    if (billingStatus == null) {
      return { ...DEFAULT_CLIENT_SUBSCRIPTION };
    }

    const scheduled = asPlan(raw.scheduledPlan);

    return {
      plan,
      billingStatus,
      entitlementActive,
      entitlementReason:
        asReason(raw.entitlementReason) ??
        (entitlementActive ? "storeSubscriptionActive" : "neverSubscribed"),
      trialStartedAt: millisOrNull(raw.trialStartedAt),
      trialEndsAt: millisOrNull(raw.trialEndsAt),
      currentPeriodStart: millisOrNull(raw.currentPeriodStart),
      currentPeriodEnd: millisOrNull(raw.currentPeriodEnd),
      platform: asPlatform(raw.platform),
      autoRenewing: raw.autoRenewing === true,
      cancelledAt: millisOrNull(raw.cancelledAt),
      gracePeriodEndsAt: millisOrNull(raw.gracePeriodEndsAt),
      scheduledPlan: scheduled === "free" ? null : scheduled,
      quotaEnforcementEnabled: raw.quotaEnforcementEnabled === true,
    };
  } catch {
    return { ...DEFAULT_CLIENT_SUBSCRIPTION };
  }
}
