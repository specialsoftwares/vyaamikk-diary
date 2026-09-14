/**
 * Client-safe subscription domain model.
 *
 * Mirror of the server `SubscriptionStatusDoc` in
 * `functions/src/billing/types.ts`. React Native must not import Firebase
 * Admin or `functions/src/**` runtime modules.
 *
 * Server Firestore `users/{uid}/subscription/status` remains authoritative.
 * This client model is consumption + UX gating only — never security.
 */

export type VyaamikkPlan = "free" | "starter" | "professional" | "business";

export type BillingLifecycleStatus =
  | "trial"
  | "active"
  | "grace"
  | "onHold"
  | "cancelled"
  | "expired";

export type EntitlementReason =
  | "neverSubscribed"
  | "trialActive"
  | "trialExpired"
  | "storeSubscriptionActive"
  | "graceRetained"
  | "cancelledPeriodRemaining"
  | "onHoldAccessRevoked"
  | "subscriptionExpired"
  | "adminGrant";

export type BillingPlatform = "android" | "ios";

export type SubscriptionSource = "server" | "cache" | "default";

/**
 * Normalized owner-readable subscription status.
 * Additive unknown server fields are ignored. Secret material (tokens, JWS,
 * GSTIN, ledger) is never represented here.
 */
export interface ClientSubscriptionStatus {
  plan: VyaamikkPlan;
  billingStatus: BillingLifecycleStatus;
  /** Server-derived access truth. Client must not invent this. */
  entitlementActive: boolean;
  entitlementReason: EntitlementReason;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  platform: BillingPlatform | null;
  autoRenewing: boolean;
  cancelledAt: number | null;
  gracePeriodEndsAt: number | null;
  scheduledPlan: VyaamikkPlan | null;
  quotaEnforcementEnabled: boolean;
}

export const VYAAMIKK_PLANS: readonly VyaamikkPlan[] = [
  "free",
  "starter",
  "professional",
  "business",
];

export const BILLING_LIFECYCLE_STATUSES: readonly BillingLifecycleStatus[] = [
  "trial",
  "active",
  "grace",
  "onHold",
  "cancelled",
  "expired",
];

export const ENTITLEMENT_REASONS: readonly EntitlementReason[] = [
  "neverSubscribed",
  "trialActive",
  "trialExpired",
  "storeSubscriptionActive",
  "graceRetained",
  "cancelledPeriodRemaining",
  "onHoldAccessRevoked",
  "subscriptionExpired",
  "adminGrant",
];

/** 14-day Vyaamikk Professional trial — capability plan while trial is active. */
export const TRIAL_PLAN: VyaamikkPlan = "professional";

/** Monthly record-creation caps. `-1` = unlimited. Descriptor only; Rules enforce. */
export const UNLIMITED_RECORDS = -1;
export const PLAN_MONTHLY_RECORD_LIMITS: Record<VyaamikkPlan, number> = {
  free: 25,
  starter: 100,
  professional: UNLIMITED_RECORDS,
  business: UNLIMITED_RECORDS,
};

export const DEFAULT_CLIENT_SUBSCRIPTION: ClientSubscriptionStatus = {
  plan: "free",
  billingStatus: "expired",
  entitlementActive: false,
  entitlementReason: "neverSubscribed",
  trialStartedAt: null,
  trialEndsAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  platform: null,
  autoRenewing: false,
  cancelledAt: null,
  gracePeriodEndsAt: null,
  scheduledPlan: null,
  quotaEnforcementEnabled: false,
};
