/**
 * Paid activation hides the free meter in the same EntitlementView publish.
 * Unreadable plan never presents Free / 0/15.
 */
import assert from "node:assert/strict";

import { buildEntitlementView } from "./entitlementView";
import { lifetimeQuotaMeterPresentation } from "./lifetimeQuotaMeterPresentation";

{
  const unknown = buildEntitlementView({
    uid: "u1",
    status: { statusReadable: false, entitlementActive: false, plan: null },
    purchase: { kind: "idle" },
  });
  const presented = lifetimeQuotaMeterPresentation(unknown);
  assert.notEqual(presented.kind, "meter");
  assert.equal(presented.kind, "checking");
}

{
  const free = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 3,
    },
    purchase: { kind: "idle" },
  });
  const presented = lifetimeQuotaMeterPresentation(free);
  assert.equal(presented.kind, "meter");
  if (presented.kind === "meter") {
    assert.equal(presented.used, 3);
    assert.equal(presented.limit, 15);
  }
}

{
  // Same-session paid activation: meter becomes none/hidden immediately
  const paid = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: true,
      plan: "unlimited",
      billingPeriod: "monthly",
    },
    purchase: { kind: "idle" },
  });
  assert.equal(paid.quota.kind, "hidden");
  assert.equal(lifetimeQuotaMeterPresentation(paid).kind, "none");
}

{
  // Verifying purchase progress must not flash Free while paid access holds
  const periodChange = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: true,
      plan: "unlimited",
      billingPeriod: "yearly",
    },
    purchase: { kind: "period_change_pending" },
  });
  assert.equal(periodChange.entitlement.kind, "paid");
  assert.equal(periodChange.quota.kind, "hidden");
  assert.equal(lifetimeQuotaMeterPresentation(periodChange).kind, "none");
}

console.log("lifetimeQuotaMeterHideOnPaid.test.ts: ok");
