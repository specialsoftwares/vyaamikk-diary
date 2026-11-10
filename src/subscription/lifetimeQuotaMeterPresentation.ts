/**
 * Shared dashboard writer — free-meter presentation from EntitlementView only.
 *
 * Paid / hidden → render nothing (remove entire meter, no reserved space).
 * Unknown → Checking your plan / retry.
 * Free → used/limit meter. Creation screens mount the same model.
 */

import type { EntitlementView } from "./entitlementView";

export type LifetimeQuotaMeterPresentation =
  | { kind: "none" }
  | {
      kind: "checking";
      titleKey: "billing.entitlement.checkingPlan";
      retryKey: "billing.entitlement.retryPlan";
    }
  | {
      kind: "unavailable";
      titleKey: "billing.entitlement.planUnavailable";
      retryKey: "billing.entitlement.retryPlan";
    }
  | {
      kind: "meter";
      used: number;
      limit: number;
      copyKey: "billing.entitlement.lifetimeUsed";
      warnNearLimit: boolean;
    };

export function lifetimeQuotaMeterPresentation(
  view: EntitlementView | null | undefined
): LifetimeQuotaMeterPresentation {
  if (view == null) {
    return {
      kind: "checking",
      titleKey: "billing.entitlement.checkingPlan",
      retryKey: "billing.entitlement.retryPlan",
    };
  }
  switch (view.quota.kind) {
    case "hidden":
      return { kind: "none" };
    case "checking":
      return {
        kind: "checking",
        titleKey: "billing.entitlement.checkingPlan",
        retryKey: "billing.entitlement.retryPlan",
      };
    case "unavailable":
      return {
        kind: "unavailable",
        titleKey: "billing.entitlement.planUnavailable",
        retryKey: "billing.entitlement.retryPlan",
      };
    case "meter":
      return {
        kind: "meter",
        used: view.quota.used,
        limit: view.quota.limit,
        copyKey: "billing.entitlement.lifetimeUsed",
        warnNearLimit: view.quota.used >= Math.ceil(view.quota.limit * 0.8),
      };
    default: {
      const _exhaustive: never = view.quota;
      return _exhaustive;
    }
  }
}
