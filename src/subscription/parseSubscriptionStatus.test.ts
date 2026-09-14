/**
 * Fail-closed parser (test H, I, J).
 */
import assert from "node:assert/strict";

import { parseSubscriptionStatus } from "./parseSubscriptionStatus";
import { featuresForSubscription } from "./subscriptionFeatures";

{
  // J. missing / null document → free
  for (const raw of [null, undefined, 0, "", [], true]) {
    const parsed = parseSubscriptionStatus(raw);
    assert.equal(parsed.plan, "free");
    assert.equal(parsed.entitlementActive, false);
    assert.equal(featuresForSubscription(parsed).canUseProfessionalFeatures, false);
  }
}

{
  // H. unknown plan / status fail closed
  const unknownPlan = parseSubscriptionStatus({
    plan: "enterprise",
    billingStatus: "active",
    entitlementActive: true,
    currentPeriodEnd: 9_000_000_000_000,
  });
  assert.equal(unknownPlan.plan, "free");
  assert.equal(unknownPlan.entitlementActive, true);
  assert.equal(unknownPlan.billingStatus, "active");
  assert.equal(
    featuresForSubscription(unknownPlan).canUseProfessionalFeatures,
    false,
    "unknown plan is free for feature access"
  );

  const unknownStatus = parseSubscriptionStatus({
    plan: "professional",
    billingStatus: "paused",
    entitlementActive: true,
    currentPeriodEnd: 9_000_000_000_000,
  });
  assert.equal(unknownStatus.entitlementActive, false);
  assert.equal(unknownStatus.plan, "free");
  assert.equal(featuresForSubscription(unknownStatus).canUseProfessionalFeatures, false);
}

{
  // I. malformed server document does not throw
  const weird = parseSubscriptionStatus({
    plan: { nested: true },
    billingStatus: 12,
    entitlementActive: "yes",
    trialEndsAt: "tomorrow",
    currentPeriodEnd: { seconds: 1 },
    platform: "web",
    autoRenewing: "true",
    extraAdditiveField: { gstin: "should-be-ignored" },
    scheduledPlan: "platinum",
    quotaEnforcementEnabled: "yes",
  });
  assert.equal(weird.plan, "free");
  assert.equal(weird.entitlementActive, false);
  assert.equal(weird.platform, null);
  assert.equal(weird.autoRenewing, false);
  assert.equal(weird.quotaEnforcementEnabled, false);
  assert.equal(weird.scheduledPlan, null);
  assert.equal(weird.trialEndsAt, null);
  assert.equal(weird.currentPeriodEnd, null);
}

{
  const valid = parseSubscriptionStatus({
    plan: "starter",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: 1,
    currentPeriodEnd: 2,
    platform: "android",
    autoRenewing: true,
    scheduledPlan: "professional",
    quotaEnforcementEnabled: true,
    productId: "vyd_starter",
    ignoredSecret: "nope",
  });
  assert.equal(valid.plan, "starter");
  assert.equal(valid.entitlementActive, true);
  assert.equal(valid.platform, "android");
  assert.equal(valid.scheduledPlan, "professional");
  assert.equal(valid.quotaEnforcementEnabled, true);
  assert.equal("productId" in valid, false);
}

{
  // entitlementActive must be boolean true — string/1 fail closed
  const coerced = parseSubscriptionStatus({
    plan: "business",
    billingStatus: "active",
    entitlementActive: 1,
    currentPeriodEnd: 9_000_000_000_000,
  });
  assert.equal(coerced.entitlementActive, false);
}

console.log("parseSubscriptionStatus.test.ts: ok");
