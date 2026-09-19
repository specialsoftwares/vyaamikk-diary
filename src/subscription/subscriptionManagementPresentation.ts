/**
 * Presentation helpers for Subscription & billing. UI must not encode
 * lifecycle rules; this module maps already-authoritative status fields.
 */

import { isIstMonthKeyShape, istMonthKeyForMillis } from "@/billing/istMonthKey";
import { UNLIMITED_RECORDS, type ClientSubscriptionStatus, type VyaamikkPlan } from "./types";
import type { SubscriptionFeatures } from "./subscriptionFeatures";
import type { QuotaUsageRead } from "./quotaUsageReader";

export type ManagementPendingKind =
  | "none"
  | "cancelled_remaining"
  | "grace"
  | "on_hold"
  | "expired"
  | "trial";

export type QuotaUsageCurrency =
  | { kind: "current"; used: number; monthKey: string }
  | { kind: "prior_month"; storedMonthKey: string }
  | { kind: "future_month"; storedMonthKey: string }
  | { kind: "malformed" }
  | { kind: "missing" }
  | { kind: "unavailable"; code?: string };

export type ManagementQuotaKind =
  | { kind: "unlimited" }
  | {
      kind: "capped";
      limit: number;
      used: number | null;
      monthKey: string | null;
      currency: QuotaUsageCurrency;
      warnAt80: boolean;
    }
  | { kind: "unavailable"; currency: QuotaUsageCurrency };

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

export function interpretQuotaUsage(input: {
  read: QuotaUsageRead | null;
  nowMs: number;
}): QuotaUsageCurrency {
  if (!input.read) return { kind: "unavailable" };
  if (input.read.kind === "missing") return { kind: "missing" };
  if (input.read.kind === "unavailable") {
    return { kind: "unavailable", code: input.read.code };
  }
  if (input.read.kind === "malformed") return { kind: "malformed" };
  const monthKey = input.read.monthKey;
  const used = input.read.recordsThisMonth;
  if (
    !isIstMonthKeyShape(monthKey) ||
    typeof used !== "number" ||
    !Number.isInteger(used) ||
    used < 0
  ) {
    return { kind: "malformed" };
  }
  const current = istMonthKeyForMillis(input.nowMs);
  if (monthKey < current) return { kind: "prior_month", storedMonthKey: monthKey };
  if (monthKey > current) return { kind: "future_month", storedMonthKey: monthKey };
  return { kind: "current", used, monthKey };
}

export function managementQuotaView(input: {
  features: SubscriptionFeatures;
  usage: QuotaUsageRead | null;
  nowMs: number;
}): ManagementQuotaKind {
  const currency = interpretQuotaUsage({ read: input.usage, nowMs: input.nowMs });
  if (input.features.monthlyRecordLimit === UNLIMITED_RECORDS) {
    return { kind: "unlimited" };
  }
  if (currency.kind === "unavailable" || currency.kind === "malformed") {
    return { kind: "unavailable", currency };
  }
  const used = currency.kind === "current" ? currency.used : null;
  const monthKey = currency.kind === "current" ? currency.monthKey : null;
  const limit = input.features.monthlyRecordLimit;
  const warnAt80 = used != null && limit > 0 && used / limit >= 0.8;
  return {
    kind: "capped",
    limit,
    used,
    monthKey,
    currency,
    warnAt80,
  };
}

export function androidProductIdForPlan(plan: VyaamikkPlan): string | null {
  if (plan === "free") return null;
  return `vyd_${plan}`;
}

export function billingDetailsInvoiceReady(draft: {
  billingRecipientName: string;
  billingAddressLine1: string;
  billingPostalCode: string;
  billingStateCode: string;
}): boolean {
  const pin = draft.billingPostalCode.trim();
  return (
    draft.billingRecipientName.trim().length > 0 &&
    draft.billingAddressLine1.trim().length > 0 &&
    /^\d{6}$/.test(pin) &&
    /^\d{2}$/.test(draft.billingStateCode.trim())
  );
}
