/**
 * Lead-owned account entitlement vs purchase-progress contract.
 *
 * Confirmed free, confirmed paid, and unknown are distinct. Purchase
 * progress is orthogonal: a paid user changing billing periods keeps
 * valid paid access while the change is pending. Meters and CTAs must
 * consume only EntitlementView — never raw subscription/status flashes.
 *
 * Auth/rules/read failure → unknown (never Free / 0/15).
 * Authoritative paid activation for the current account hides the free
 * meter in the same publish as the plan change (dashboard + open create).
 */

export const FREE_LIFETIME_RECORD_LIMIT = 15 as const;

export type PaidPlanLabel = "monthly" | "yearly" | "legacy_paid";

export type AccountEntitlement =
  | { kind: "unknown" }
  | { kind: "free"; lifetimeUsed: number }
  | {
      kind: "paid";
      plan: PaidPlanLabel;
      /** Preserved Starter (or other legacy) cap until an explicit migration. */
      legacyCap?: number;
    };

export type PurchaseProgress =
  | { kind: "idle" }
  | { kind: "pending_payment" }
  | { kind: "verifying" }
  | {
      kind: "period_change_pending";
      currentAccess: Extract<AccountEntitlement, { kind: "paid" }>;
    }
  | { kind: "check_status_available" };

export type LifetimeQuotaView =
  | { kind: "hidden" }
  | { kind: "meter"; used: number; limit: typeof FREE_LIFETIME_RECORD_LIMIT }
  | { kind: "checking" }
  | { kind: "unavailable" };

export type EntitlementView = {
  uid: string;
  entitlement: AccountEntitlement;
  purchase: PurchaseProgress;
  quota: LifetimeQuotaView;
  canCreateRecord: boolean;
  purchaseAllowed: boolean;
};

export type EntitlementStatusInput = {
  /** True only when subscription/status was read authoritatively for this uid. */
  statusReadable: boolean;
  entitlementActive: boolean;
  /** Raw server plan while entitled; ignored when not entitled. */
  plan: string | null;
  /** Base-plan period when known (unlimited monthly/yearly). */
  billingPeriod?: "monthly" | "yearly" | null;
  /** Starter (and similar) still keep their existing cap. */
  legacyMonthlyCap?: number | null;
  lifetimeUsed?: number | null;
};

export type PurchaseProgressInput =
  | { kind: "idle" }
  | { kind: "pending_payment" }
  | { kind: "verifying" }
  | { kind: "period_change_pending" }
  | { kind: "check_status_available" };

function clampLifetimeUsed(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return 0;
  return Math.min(raw, FREE_LIFETIME_RECORD_LIMIT);
}

function paidPlanFromStatus(input: EntitlementStatusInput): PaidPlanLabel {
  if (input.billingPeriod === "monthly") return "monthly";
  if (input.billingPeriod === "yearly") return "yearly";
  const plan = input.plan;
  if (plan === "starter" || plan === "professional" || plan === "business") {
    return "legacy_paid";
  }
  // Unlimited product without a recognized legacy plan name.
  // billingPeriod was already handled above; default Unlimited to monthly.
  if (plan === "unlimited" || plan === "monthly" || plan === "yearly") {
    return plan === "yearly" ? "yearly" : "monthly";
  }
  return "legacy_paid";
}

function buildPaidEntitlement(
  input: EntitlementStatusInput
): Extract<AccountEntitlement, { kind: "paid" }> {
  const plan = paidPlanFromStatus(input);
  const legacyCap =
    plan === "legacy_paid" &&
    typeof input.legacyMonthlyCap === "number" &&
    Number.isInteger(input.legacyMonthlyCap) &&
    input.legacyMonthlyCap > 0
      ? input.legacyMonthlyCap
      : undefined;
  return legacyCap != null ? { kind: "paid", plan, legacyCap } : { kind: "paid", plan };
}

/**
 * Pure selector. Callers supply already-bound owner uid + readable status
 * and orthogonal purchase progress. Never invents Free from unread status.
 */
export function buildEntitlementView(args: {
  uid: string;
  status: EntitlementStatusInput | null;
  purchase: PurchaseProgressInput;
}): EntitlementView {
  const { uid, status, purchase: purchaseInput } = args;

  if (status == null || !status.statusReadable) {
    const purchase: PurchaseProgress =
      purchaseInput.kind === "period_change_pending"
        ? { kind: "check_status_available" }
        : purchaseInput;
    return {
      uid,
      entitlement: { kind: "unknown" },
      purchase,
      quota: { kind: "checking" },
      canCreateRecord: false,
      purchaseAllowed: purchase.kind === "idle" || purchase.kind === "check_status_available",
    };
  }

  if (status.entitlementActive) {
    const paid = buildPaidEntitlement(status);
    const purchase: PurchaseProgress =
      purchaseInput.kind === "period_change_pending"
        ? { kind: "period_change_pending", currentAccess: paid }
        : purchaseInput;
    return {
      uid,
      entitlement: paid,
      purchase,
      quota: { kind: "hidden" },
      canCreateRecord: true,
      purchaseAllowed:
        purchase.kind === "idle" || purchase.kind === "check_status_available",
    };
  }

  const lifetimeUsed = clampLifetimeUsed(status.lifetimeUsed);
  const purchase: PurchaseProgress =
    purchaseInput.kind === "period_change_pending"
      ? { kind: "idle" }
      : purchaseInput;
  return {
    uid,
    entitlement: { kind: "free", lifetimeUsed },
    purchase,
    quota: {
      kind: "meter",
      used: lifetimeUsed,
      limit: FREE_LIFETIME_RECORD_LIMIT,
    },
    canCreateRecord: lifetimeUsed < FREE_LIFETIME_RECORD_LIMIT,
    purchaseAllowed:
      purchase.kind === "idle" || purchase.kind === "check_status_available",
  };
}

/** User-visible copy keys for unknown / unreadable plan (i18n writer owns strings). */
export const ENTITLEMENT_CHECKING_COPY_KEY = "billing.entitlement.checkingPlan" as const;
export const ENTITLEMENT_RETRY_COPY_KEY = "billing.entitlement.retryPlan" as const;
