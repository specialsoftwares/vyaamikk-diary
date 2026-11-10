import assert from "node:assert/strict";

import {
  FREE_LIFETIME_RECORD_LIMIT,
  buildEntitlementView,
} from "./entitlementView";

{
  // Unknown / unreadable — never Free or 0/15
  const view = buildEntitlementView({
    uid: "u1",
    status: null,
    purchase: { kind: "idle" },
  });
  assert.equal(view.entitlement.kind, "unknown");
  assert.equal(view.quota.kind, "checking");
  assert.equal(view.canCreateRecord, false);
  assert.equal(view.purchaseAllowed, true);
}

{
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: false,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 0,
    },
    purchase: { kind: "idle" },
  });
  assert.equal(view.entitlement.kind, "unknown");
  assert.equal(view.quota.kind, "checking");
  assert.notEqual(view.quota.kind, "meter");
}

{
  // Confirmed free meter
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 3,
    },
    purchase: { kind: "idle" },
  });
  assert.deepEqual(view.entitlement, { kind: "free", lifetimeUsed: 3 });
  assert.deepEqual(view.quota, {
    kind: "meter",
    used: 3,
    limit: FREE_LIFETIME_RECORD_LIMIT,
  });
  assert.equal(view.canCreateRecord, true);
}

{
  // Free at 15/15
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 15,
    },
    purchase: { kind: "idle" },
  });
  assert.equal(view.canCreateRecord, false);
  assert.equal(view.quota.kind, "meter");
  if (view.quota.kind === "meter") assert.equal(view.quota.used, 15);
}

{
  // Authoritative paid hides meter in the same publish
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: true,
      plan: "unlimited",
      billingPeriod: "monthly",
      lifetimeUsed: 7,
    },
    purchase: { kind: "idle" },
  });
  assert.equal(view.entitlement.kind, "paid");
  if (view.entitlement.kind === "paid") assert.equal(view.entitlement.plan, "monthly");
  assert.deepEqual(view.quota, { kind: "hidden" });
  assert.equal(view.canCreateRecord, true);
}

{
  // Period change pending keeps paid access
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: true,
      plan: "unlimited",
      billingPeriod: "yearly",
    },
    purchase: { kind: "period_change_pending" },
  });
  assert.equal(view.entitlement.kind, "paid");
  assert.equal(view.purchase.kind, "period_change_pending");
  if (view.purchase.kind === "period_change_pending") {
    assert.equal(view.purchase.currentAccess.plan, "yearly");
  }
  assert.deepEqual(view.quota, { kind: "hidden" });
  assert.equal(view.purchaseAllowed, false);
}

{
  // Pending payment blocks repeat checkout
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 2,
    },
    purchase: { kind: "pending_payment" },
  });
  assert.equal(view.purchaseAllowed, false);
  assert.equal(view.entitlement.kind, "free");
}

{
  // Legacy Starter preserves existing cap
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: true,
      plan: "starter",
      legacyMonthlyCap: 100,
    },
    purchase: { kind: "idle" },
  });
  assert.deepEqual(view.entitlement, {
    kind: "paid",
    plan: "legacy_paid",
    legacyCap: 100,
  });
  assert.deepEqual(view.quota, { kind: "hidden" });
}

{
  // Verifying blocks purchaseAllowed
  const view = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 0,
    },
    purchase: { kind: "verifying" },
  });
  assert.equal(view.purchaseAllowed, false);
}

console.log("entitlementView.test.ts: ok");
