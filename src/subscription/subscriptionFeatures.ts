/**
 * Single client feature-matrix authority.
 *
 * UI and business components must use named capabilities from this file.
 * Do not compare raw plan strings (`plan === "professional"`) in screens.
 *
 * These flags are UX gating only. They are NOT security:
 * Firestore Rules, server validation, and quota architecture remain
 * authoritative. Hidden buttons must never be treated as enforcement.
 *
 * Only currently implemented product capabilities are encoded.
 * Intentionally absent (not built / owner-marked future): multi-business
 * profiles, AI features, CSV/advanced exports, premium templates.
 */

import {
  PLAN_MONTHLY_RECORD_LIMITS,
  TRIAL_PLAN,
  type ClientSubscriptionStatus,
  type VyaamikkPlan,
} from "./types";

/**
 * Explicit plan rank. Do not use lexical/string ordering.
 * free < starter < professional < business
 */
export const SUBSCRIPTION_PLAN_RANK: Record<VyaamikkPlan, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
};

export function subscriptionPlanRank(plan: VyaamikkPlan): number {
  return SUBSCRIPTION_PLAN_RANK[plan];
}

export interface SubscriptionFeatures {
  canUseStarterFeatures: boolean;
  canUseProfessionalFeatures: boolean;
  canUseBusinessFeatures: boolean;
  /** Implemented professional-pack / professional-brief product. */
  canUseProfessionalBrief: boolean;
  /** Implemented business insights dashboard. */
  canUseBusinessInsights: boolean;
  /**
   * Monthly billable-record cap descriptor matching the server catalog.
   * `-1` = unlimited. UX copy only — Rules enforce when enabled.
   */
  monthlyRecordLimit: number;
}

export type SubscriptionFeatureFlag = {
  [K in keyof SubscriptionFeatures]: SubscriptionFeatures[K] extends boolean ? K : never;
}[keyof SubscriptionFeatures];

function planAtLeast(plan: VyaamikkPlan, minimum: VyaamikkPlan): boolean {
  return SUBSCRIPTION_PLAN_RANK[plan] >= SUBSCRIPTION_PLAN_RANK[minimum];
}

/**
 * Capabilities for an entitled plan. Higher ranks inherit lower-plan
 * capabilities (none of these flags are plan-exclusive exceptions).
 */
export function featuresForPlan(plan: VyaamikkPlan): SubscriptionFeatures {
  return {
    canUseStarterFeatures: planAtLeast(plan, "starter"),
    canUseProfessionalFeatures: planAtLeast(plan, "professional"),
    canUseBusinessFeatures: planAtLeast(plan, "business"),
    canUseProfessionalBrief: planAtLeast(plan, "professional"),
    canUseBusinessInsights: planAtLeast(plan, "business"),
    monthlyRecordLimit: PLAN_MONTHLY_RECORD_LIMITS[plan],
  };
}

/**
 * Effective plan for feature access.
 *
 * Known non-access statuses (onHold, expired) are ALWAYS free, even if a
 * malformed document sets entitlementActive=true. Timestamp expiry is applied
 * separately by `reduceCachedEntitlement` — this matrix does not invent clocks.
 */
export function effectivePlanForSubscription(status: ClientSubscriptionStatus): VyaamikkPlan {
  switch (status.billingStatus) {
    case "trial":
      return status.entitlementActive ? TRIAL_PLAN : "free";
    case "active":
    case "grace":
    case "cancelled":
      return status.entitlementActive ? status.plan : "free";
    case "onHold":
    case "expired":
    default:
      return "free";
  }
}

export function featuresForSubscription(status: ClientSubscriptionStatus): SubscriptionFeatures {
  return featuresForPlan(effectivePlanForSubscription(status));
}

/**
 * Firestore SDK cache / other non-authoritative evidence may only preserve
 * or reduce the already-accepted same-uid plan. It must never widen:
 * free→paid or a lower plan→a higher plan.
 *
 * `accepted` and `candidate` should already be time-reduced. Equal rank
 * keeps `accepted` so SDK-cache timestamps cannot extend access.
 */
export function preferNonAuthoritativeStatus(
  accepted: ClientSubscriptionStatus,
  candidate: ClientSubscriptionStatus | null
): ClientSubscriptionStatus {
  if (candidate == null) return accepted;
  const acceptedRank = subscriptionPlanRank(effectivePlanForSubscription(accepted));
  const candidateRank = subscriptionPlanRank(effectivePlanForSubscription(candidate));
  if (candidateRank > acceptedRank) return accepted;
  if (candidateRank < acceptedRank) return candidate;
  return accepted;
}

export function hasSubscriptionFeature(
  features: SubscriptionFeatures,
  flag: SubscriptionFeatureFlag
): boolean {
  return features[flag] === true;
}
