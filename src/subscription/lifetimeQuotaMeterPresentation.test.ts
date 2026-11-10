import assert from "node:assert/strict";

import { buildEntitlementView } from "./entitlementView";
import { lifetimeQuotaMeterPresentation } from "./lifetimeQuotaMeterPresentation";

{
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
  assert.deepEqual(lifetimeQuotaMeterPresentation(paid), { kind: "none" });
}

{
  const unknown = buildEntitlementView({
    uid: "u1",
    status: null,
    purchase: { kind: "idle" },
  });
  const presented = lifetimeQuotaMeterPresentation(unknown);
  assert.equal(presented.kind, "checking");
}

{
  const free = buildEntitlementView({
    uid: "u1",
    status: {
      statusReadable: true,
      entitlementActive: false,
      plan: "free",
      lifetimeUsed: 12,
    },
    purchase: { kind: "idle" },
  });
  const presented = lifetimeQuotaMeterPresentation(free);
  assert.equal(presented.kind, "meter");
  if (presented.kind === "meter") {
    assert.equal(presented.used, 12);
    assert.equal(presented.limit, 15);
    assert.equal(presented.warnNearLimit, true);
  }
}

{
  assert.equal(lifetimeQuotaMeterPresentation(null).kind, "checking");
}

console.log("lifetimeQuotaMeterPresentation.test.ts: ok");
