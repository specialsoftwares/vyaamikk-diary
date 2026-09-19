/**
 * You-dashboard ordinary-quota 80% warning. Presentation only: current IST
 * month, capped plans, nonnegative integer usage. No purchase entry.
 */

import type { SubscriptionFeatures } from "./subscriptionFeatures";
import type { QuotaUsageRead } from "./quotaUsageReader";
import { managementQuotaView } from "./subscriptionManagementPresentation";

export type YouDashboardQuotaWarning =
  | { kind: "none" }
  | { kind: "warn80"; used: number; limit: number };

export function youDashboardQuotaWarning(input: {
  features: SubscriptionFeatures;
  usage: QuotaUsageRead | null;
  nowMs: number;
}): YouDashboardQuotaWarning {
  const view = managementQuotaView(input);
  if (view.kind !== "capped" || !view.warnAt80 || view.used == null) {
    return { kind: "none" };
  }
  return { kind: "warn80", used: view.used, limit: view.limit };
}
