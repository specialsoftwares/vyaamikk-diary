/**
 * Zero-frame uid isolation (tests G–I). Pure helper — no React test renderer.
 */
import assert from "node:assert/strict";

import { DEFAULT_CLIENT_SUBSCRIPTION } from "./types";
import { featuresForPlan, featuresForSubscription } from "./subscriptionFeatures";
import { bindSubscriptionViewToAuth } from "./subscriptionViewBinding";
import type { SubscriptionView } from "./subscriptionSession";

function professionalView(ownerUid: string): SubscriptionView {
  const status = {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "professional" as const,
    billingStatus: "active" as const,
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive" as const,
    currentPeriodEnd: 9_000_000_000_000,
  };
  return {
    status,
    plan: "professional",
    features: featuresForPlan("professional"),
    source: "server",
    isLoading: false,
    isRefreshing: false,
    isOffline: false,
    isStale: false,
    error: null,
    ownerUid,
  };
}

{
  // G. uid-A paid view under uid-B auth → free
  const exposed = bindSubscriptionViewToAuth({
    view: professionalView("uid-a"),
    authStatus: "signed_in",
    authUid: "uid-b",
  });
  assert.equal(exposed.plan, "free");
  assert.equal(exposed.features.canUseProfessionalFeatures, false);
  assert.equal(exposed.source, "default");
  assert.equal(exposed.ownerUid, "uid-b");
}

{
  // H. paid view + signed_out → free
  const exposed = bindSubscriptionViewToAuth({
    view: professionalView("uid-a"),
    authStatus: "signed_out",
    authUid: null,
  });
  assert.equal(exposed.plan, "free");
  assert.equal(exposed.features.canUseProfessionalBrief, false);
  assert.equal(exposed.ownerUid, null);
  assert.equal(exposed.isLoading, false);
}

{
  // I. same uid A remains visible
  const view = professionalView("uid-a");
  const exposed = bindSubscriptionViewToAuth({
    view,
    authStatus: "signed_in",
    authUid: "uid-a",
  });
  assert.equal(exposed.plan, "professional");
  assert.equal(exposed.features.canUseProfessionalFeatures, true);
  assert.equal(exposed, view);
}

{
  assert.equal(
    featuresForSubscription(professionalView("uid-a").status).canUseProfessionalBrief,
    true
  );
}

console.log("subscriptionViewBinding.test.ts: ok");
