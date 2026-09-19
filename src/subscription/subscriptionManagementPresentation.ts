/**
 * Presentation helpers for Subscription & billing. UI must not encode
 * lifecycle rules; this module maps already-authoritative status fields.
 */

import { UNLIMITED_RECORDS, type ClientSubscriptionStatus, type VyaamikkPlan } from "./types";
import type { SubscriptionFeatures } from "./subscriptionFeatures";

export type ManagementPendingKind =
  | "none"
  | "cancelled_remaining"
  | "grace"
  | "on_hold"
  | "expired"
  | "trial";

export type ManagementQuotaKind =
  | { kind: "unlimited" }
  | { kind: "capped"; limit: number; used: number | null }
  | { kind: "unavailable" };

const PLAN_NAME_KEYS: Record<VyaamikkPlan, string> = {
  free: "billing.upgrade.freePlanName",
  starter: "billing.upgrade.plans.starter.name",
  professional: "billing.upgrade.plans.professional.name",
  business: "billing.upgrade.plans.business.name",
};

export function managementPlanNameKey(plan: VyaamikkPlan): string {
  return PLAN_NAME_KEYS[plan];
}

export function managementPendingKind(status: ClientSubscriptionStatus): ManagementPendingKind {
  switch (status.entitlementReason) {
    case "cancelledPeriodRemaining":
      return "cancelled_remaining";
    case "graceRetained":
      return "grace";
    case "onHoldAccessRevoked":
      return "on_hold";
    case "subscriptionExpired":
    case "trialExpired":
      return "expired";
    case "trialActive":
      return "trial";
    default:
      return "none";
  }
}

export function managementPendingCopyKey(kind: ManagementPendingKind): string {
  switch (kind) {
    case "cancelled_remaining":
      return "billing.management.pendingCancelledRemaining";
    case "grace":
      return "billing.management.pendingGrace";
    case "on_hold":
      return "billing.management.pendingOnHold";
    case "expired":
      return "billing.management.pendingExpired";
    case "trial":
      return "billing.management.pendingTrial";
    default:
      return "billing.management.pendingNone";
  }
}

export function managementPeriodEndMs(status: ClientSubscriptionStatus): number | null {
  if (typeof status.currentPeriodEnd === "number" && status.currentPeriodEnd > 0) {
    return status.currentPeriodEnd;
  }
  return null;
}

export function managementQuotaView(input: {
  features: SubscriptionFeatures;
  recordsThisMonth: number | null;
  usageReadable: boolean;
}): ManagementQuotaKind {
  if (!input.usageReadable && input.recordsThisMonth == null) {
    return { kind: "unavailable" };
  }
  if (input.features.monthlyRecordLimit === UNLIMITED_RECORDS) {
    return { kind: "unlimited" };
  }
  return {
    kind: "capped",
    limit: input.features.monthlyRecordLimit,
    used: input.recordsThisMonth,
  };
}

export function androidProductIdForPlan(plan: VyaamikkPlan): string | null {
  if (plan === "free") return null;
  return `vyd_${plan}`;
}
