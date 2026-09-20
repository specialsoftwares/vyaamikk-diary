import assert from "node:assert/strict";

import {
  FREE_MONTHLY_RECORD_CAP,
  STARTER_MONTHLY_RECORD_CAP,
  UNLIMITED_MONTHLY_RECORD_CAP,
  monthlyRecordCapFromStatusData,
  quotaEnforcementEnabledFromStatusData,
} from "./monthlyRecordCap";

assert.equal(quotaEnforcementEnabledFromStatusData(undefined), false);
assert.equal(quotaEnforcementEnabledFromStatusData({}), false);
assert.equal(quotaEnforcementEnabledFromStatusData({ quotaEnforcementEnabled: true }), true);
assert.equal(quotaEnforcementEnabledFromStatusData({ quotaEnforcementEnabled: "yes" }), false);

assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "starter" }),
  STARTER_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "professional" }),
  UNLIMITED_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "business" }),
  UNLIMITED_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "free" }),
  FREE_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: false, plan: "starter" }),
  FREE_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "proffesional" }),
  FREE_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true, plan: "enterprise" }),
  FREE_MONTHLY_RECORD_CAP
);
assert.equal(
  monthlyRecordCapFromStatusData({ entitlementActive: true }),
  FREE_MONTHLY_RECORD_CAP
);

console.log("monthlyRecordCap.test.ts: ok");
