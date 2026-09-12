/**
 * deriveEntitlement — explicit-clock fail-closed matrix.
 * Run: npm run test:billing-entitlement
 */

import assert from "node:assert/strict";

import { deriveEntitlement, neverSubscribedEntitlement } from "./deriveEntitlement";

const NOW = 1_800_000_000_000;
const FUTURE = NOW + 86_400_000;
const PAST = NOW - 1;

assert.equal(neverSubscribedEntitlement().entitlementReason, "neverSubscribed");
assert.equal(neverSubscribedEntitlement().entitlementActive, false);

// trial + before trialEndsAt → Professional entitlement active
{
  const d = deriveEntitlement(
    { billingStatus: "trial", plan: "free", trialEndsAt: FUTURE },
    NOW
  );
  assert.equal(d.plan, "professional");
  assert.equal(d.billingStatus, "trial");
  assert.equal(d.entitlementActive, true);
  assert.equal(d.entitlementReason, "trialActive");
}

// trial + after expiry → Free
{
  const d = deriveEntitlement(
    { billingStatus: "trial", plan: "professional", trialEndsAt: PAST },
    NOW
  );
  assert.equal(d.plan, "free");
  assert.equal(d.entitlementActive, false);
  assert.equal(d.entitlementReason, "trialExpired");
}

// trialEndsAt === now is not in the future
{
  const d = deriveEntitlement(
    { billingStatus: "trial", plan: "professional", trialEndsAt: NOW },
    NOW
  );
  assert.equal(d.entitlementActive, false);
  assert.equal(d.entitlementReason, "trialExpired");
}

// active + current period valid → paid entitlement
{
  const d = deriveEntitlement(
    { billingStatus: "active", plan: "starter", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.plan, "starter");
  assert.equal(d.entitlementActive, true);
  assert.equal(d.entitlementReason, "storeSubscriptionActive");
}

// cancelled + paid period remaining → entitlement remains active
{
  const d = deriveEntitlement(
    { billingStatus: "cancelled", plan: "professional", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.plan, "professional");
  assert.equal(d.billingStatus, "cancelled");
  assert.equal(d.entitlementActive, true);
  assert.equal(d.entitlementReason, "cancelledPeriodRemaining");
}

// cancelled + period ended → expired/free
{
  const d = deriveEntitlement(
    { billingStatus: "cancelled", plan: "professional", currentPeriodEnd: PAST },
    NOW
  );
  assert.equal(d.plan, "free");
  assert.equal(d.entitlementActive, false);
  assert.equal(d.entitlementReason, "subscriptionExpired");
}

// grace + within grace → entitlement retained
{
  const d = deriveEntitlement(
    {
      billingStatus: "grace",
      plan: "business",
      gracePeriodEndsAt: FUTURE,
      currentPeriodEnd: PAST,
    },
    NOW
  );
  assert.equal(d.plan, "business");
  assert.equal(d.entitlementActive, true);
  assert.equal(d.entitlementReason, "graceRetained");
}

// grace + ended → revoked/free unless verified platform state says otherwise
{
  const d = deriveEntitlement(
    { billingStatus: "grace", plan: "business", gracePeriodEndsAt: PAST },
    NOW
  );
  assert.equal(d.entitlementActive, false);
  assert.equal(d.plan, "free");
}
{
  const d = deriveEntitlement(
    {
      billingStatus: "grace",
      plan: "business",
      gracePeriodEndsAt: PAST,
      currentPeriodEnd: FUTURE,
      verifiedPlatformAccessActive: true,
    },
    NOW
  );
  assert.equal(d.entitlementActive, true);
  assert.equal(d.entitlementReason, "graceRetained");
}

// onHold → access revoked (default)
{
  const d = deriveEntitlement(
    { billingStatus: "onHold", plan: "starter", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.entitlementActive, false);
  assert.equal(d.entitlementReason, "onHoldAccessRevoked");
  assert.equal(d.billingStatus, "onHold");
}

// expired → free
{
  const d = deriveEntitlement(
    { billingStatus: "expired", plan: "professional", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.plan, "free");
  assert.equal(d.entitlementActive, false);
}

// refund/revocation → immediate removal
{
  const d = deriveEntitlement(
    {
      billingStatus: "active",
      plan: "business",
      currentPeriodEnd: FUTURE,
      accessRevoked: true,
    },
    NOW
  );
  assert.equal(d.entitlementActive, false);
  assert.equal(d.plan, "free");
}

// unknown status fail closed
{
  const d = deriveEntitlement({ billingStatus: "paused", plan: "business" }, NOW);
  assert.equal(d.plan, "free");
  assert.equal(d.entitlementActive, false);
}

// unknown / malformed plan fail closed to free
{
  const d = deriveEntitlement(
    { billingStatus: "active", plan: "enterprise", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.plan, "free");
  assert.equal(d.entitlementActive, false);
}
{
  const d = deriveEntitlement(
    { billingStatus: "active", plan: "proffesional", currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(d.entitlementActive, false);
}

// invalid clock fail closed
{
  const d = deriveEntitlement(
    { billingStatus: "trial", plan: "professional", trialEndsAt: FUTURE },
    Number.NaN
  );
  assert.equal(d.entitlementActive, false);
}

console.log("deriveEntitlement.unit.test.ts: ok");
