/**
 * Feature matrix + plan hierarchy (test A, B, C, D, E, F, G, AA).
 */
import assert from "node:assert/strict";

import {
  DEFAULT_CLIENT_SUBSCRIPTION,
  PLAN_MONTHLY_RECORD_LIMITS,
  TRIAL_PLAN,
  type ClientSubscriptionStatus,
  type VyaamikkPlan,
} from "./types";
import {
  effectivePlanForSubscription,
  featuresForPlan,
  featuresForSubscription,
  hasSubscriptionFeature,
  preferNonAuthoritativeStatus,
  subscriptionPlanRank,
  SUBSCRIPTION_PLAN_RANK,
} from "./subscriptionFeatures";

function status(patch: Partial<ClientSubscriptionStatus>): ClientSubscriptionStatus {
  return { ...DEFAULT_CLIENT_SUBSCRIPTION, ...patch };
}

const PERIOD = 1_800_000_000_000;

{
  // A. exact feature matrix
  const free = featuresForPlan("free");
  assert.equal(free.canUseStarterFeatures, false);
  assert.equal(free.canUseProfessionalFeatures, false);
  assert.equal(free.canUseBusinessFeatures, false);
  assert.equal(free.canUseProfessionalBrief, false);
  assert.equal(free.canUseBusinessInsights, false);
  assert.equal(free.monthlyRecordLimit, 25);

  const starter = featuresForPlan("starter");
  assert.equal(starter.canUseStarterFeatures, true);
  assert.equal(starter.canUseProfessionalFeatures, false);
  assert.equal(starter.canUseBusinessFeatures, false);
  assert.equal(starter.canUseProfessionalBrief, false);
  assert.equal(starter.canUseBusinessInsights, false);
  assert.equal(starter.monthlyRecordLimit, 100);

  const professional = featuresForPlan("professional");
  assert.equal(professional.canUseStarterFeatures, true);
  assert.equal(professional.canUseProfessionalFeatures, true);
  assert.equal(professional.canUseBusinessFeatures, false);
  assert.equal(professional.canUseProfessionalBrief, true);
  assert.equal(professional.canUseBusinessInsights, false);
  assert.equal(professional.monthlyRecordLimit, -1);

  const business = featuresForPlan("business");
  assert.equal(business.canUseStarterFeatures, true);
  assert.equal(business.canUseProfessionalFeatures, true);
  assert.equal(business.canUseBusinessFeatures, true);
  assert.equal(business.canUseProfessionalBrief, true);
  assert.equal(business.canUseBusinessInsights, true);
  assert.equal(business.monthlyRecordLimit, -1);
}

{
  // L. explicit rank table — not lexical
  assert.equal(subscriptionPlanRank("free"), 0);
  assert.equal(subscriptionPlanRank("starter"), 1);
  assert.equal(subscriptionPlanRank("professional"), 2);
  assert.equal(subscriptionPlanRank("business"), 3);
  assert.ok(SUBSCRIPTION_PLAN_RANK.starter > SUBSCRIPTION_PLAN_RANK.free);
  assert.ok("business" < "free", "lexical order would put business before free");
  assert.ok(subscriptionPlanRank("business") > subscriptionPlanRank("free"));
  const plans: VyaamikkPlan[] = ["free", "starter", "professional", "business"];
  assert.deepEqual(
    plans.map((p) => PLAN_MONTHLY_RECORD_LIMITS[p]),
    [25, 100, -1, -1]
  );
}

{
  // B. Professional trial → professional capabilities
  const trial = status({
    plan: "professional",
    billingStatus: "trial",
    entitlementActive: true,
    entitlementReason: "trialActive",
    trialEndsAt: PERIOD,
  });
  assert.equal(effectivePlanForSubscription(trial), TRIAL_PLAN);
  assert.equal(featuresForSubscription(trial).canUseProfessionalBrief, true);
  assert.equal(featuresForSubscription(trial).canUseProfessionalFeatures, true);
  assert.equal(featuresForSubscription(trial).canUseBusinessFeatures, false);
  assert.equal(featuresForSubscription(trial).monthlyRecordLimit, -1);
}

{
  // C. expired trial → free
  const expiredTrial = status({
    plan: "free",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "trialExpired",
  });
  assert.equal(effectivePlanForSubscription(expiredTrial), "free");
  assert.equal(featuresForSubscription(expiredTrial).canUseProfessionalBrief, false);
  assert.equal(featuresForSubscription(expiredTrial).monthlyRecordLimit, 25);
}

{
  // D. grace retains entitled plan
  const grace = status({
    plan: "starter",
    billingStatus: "grace",
    entitlementActive: true,
    entitlementReason: "graceRetained",
    currentPeriodEnd: PERIOD,
    gracePeriodEndsAt: PERIOD,
  });
  assert.equal(effectivePlanForSubscription(grace), "starter");
  assert.equal(featuresForSubscription(grace).canUseStarterFeatures, true);
  assert.equal(featuresForSubscription(grace).canUseProfessionalFeatures, false);
}

{
  // E. onHold → free even if entitlementActive is true
  const onHold = status({
    plan: "professional",
    billingStatus: "onHold",
    entitlementActive: false,
    entitlementReason: "onHoldAccessRevoked",
  });
  assert.equal(effectivePlanForSubscription(onHold), "free");
  assert.equal(featuresForSubscription(onHold).canUseProfessionalFeatures, false);

  const onHoldContradiction = status({
    plan: "business",
    billingStatus: "onHold",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
  });
  assert.equal(effectivePlanForSubscription(onHoldContradiction), "free");
  assert.equal(featuresForSubscription(onHoldContradiction).canUseBusinessFeatures, false);
}

{
  // F. expired → free even if entitlementActive is true
  const expired = status({
    plan: "business",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "subscriptionExpired",
  });
  assert.equal(effectivePlanForSubscription(expired), "free");
  assert.equal(featuresForSubscription(expired).canUseBusinessInsights, false);

  const expiredContradiction = status({
    plan: "professional",
    billingStatus: "expired",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
  });
  assert.equal(effectivePlanForSubscription(expiredContradiction), "free");
  assert.equal(featuresForSubscription(expiredContradiction).canUseProfessionalBrief, false);
}

{
  // R. trial + entitlementActive false → free
  const trialOff = status({
    plan: "professional",
    billingStatus: "trial",
    entitlementActive: false,
    trialEndsAt: PERIOD,
  });
  assert.equal(effectivePlanForSubscription(trialOff), "free");
}

{
  // G. cancelled retained-access follows entitlementActive + period
  const cancelledLive = status({
    plan: "professional",
    billingStatus: "cancelled",
    entitlementActive: true,
    entitlementReason: "cancelledPeriodRemaining",
    currentPeriodEnd: PERIOD,
    cancelledAt: PERIOD - 1,
  });
  assert.equal(featuresForSubscription(cancelledLive).canUseProfessionalBrief, true);

  const cancelledLapsed = status({
    plan: "professional",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "subscriptionExpired",
  });
  assert.equal(featuresForSubscription(cancelledLapsed).canUseProfessionalBrief, false);
}

{
  // AA. helpers
  const biz = featuresForPlan("business");
  assert.equal(hasSubscriptionFeature(biz, "canUseBusinessInsights"), true);
  assert.equal(hasSubscriptionFeature(featuresForPlan("free"), "canUseBusinessInsights"), false);
}

{
  // UX flags are not security — documented by failing closed when not entitled
  // even if the raw plan field still names a paid tier.
  const spoof = status({
    plan: "business",
    billingStatus: "expired",
    entitlementActive: false,
  });
  assert.equal(featuresForSubscription(spoof).canUseBusinessFeatures, false);
}

{
  // Non-authoritative evidence must not widen effective plan rank
  const free = status({});
  const starter = status({
    plan: "starter",
    billingStatus: "active",
    entitlementActive: true,
    currentPeriodEnd: PERIOD,
  });
  const professional = status({
    plan: "professional",
    billingStatus: "active",
    entitlementActive: true,
    currentPeriodEnd: PERIOD,
  });
  const business = status({
    plan: "business",
    billingStatus: "active",
    entitlementActive: true,
    currentPeriodEnd: PERIOD,
  });
  const expired = status({
    plan: "professional",
    billingStatus: "expired",
    entitlementActive: false,
  });
  assert.equal(effectivePlanForSubscription(preferNonAuthoritativeStatus(free, professional)), "free");
  assert.equal(effectivePlanForSubscription(preferNonAuthoritativeStatus(free, business)), "free");
  assert.equal(effectivePlanForSubscription(preferNonAuthoritativeStatus(starter, professional)), "starter");
  assert.equal(effectivePlanForSubscription(preferNonAuthoritativeStatus(professional, professional)), "professional");
  assert.equal(effectivePlanForSubscription(preferNonAuthoritativeStatus(professional, expired)), "free");
}

console.log("subscriptionFeatures.test.ts: ok");
