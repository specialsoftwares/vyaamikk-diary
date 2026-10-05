import assert from "node:assert/strict";

import {
  GRIN_EXPIRED_FINAL_NOTICE_MS,
  GRIN_EXPIRED_READ_EXPORT_MS,
  genuineExpiryAtMs,
  grinAccessPhase,
  mayIssueOrUploadGrinCloud,
  mayReadDownloadExportGrin,
} from "./entitlementLifecycle";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 6, 6, 30, 0, 0);

assert.equal(grinAccessPhase(undefined, T0), "entitled_or_free");
assert.equal(
  grinAccessPhase({ entitlementActive: true, plan: "starter" }, T0),
  "entitled_or_free"
);
assert.equal(
  grinAccessPhase({ entitlementActive: false, entitlementReason: "neverSubscribed" }, T0),
  "entitled_or_free"
);
assert.equal(genuineExpiryAtMs({ entitlementActive: false, entitlementReason: "neverSubscribed" }), null);

const expired = {
  entitlementActive: false,
  entitlementReason: "subscriptionExpired",
  currentPeriodEnd: T0,
  updatedAt: T0,
};
assert.equal(grinAccessPhase(expired, T0), "expired_read_export");
assert.equal(grinAccessPhase(expired, T0 + GRIN_EXPIRED_READ_EXPORT_MS - 1), "expired_read_export");
assert.equal(grinAccessPhase(expired, T0 + GRIN_EXPIRED_READ_EXPORT_MS), "expired_final_notice");
assert.equal(
  grinAccessPhase(expired, T0 + GRIN_EXPIRED_READ_EXPORT_MS + GRIN_EXPIRED_FINAL_NOTICE_MS - 1),
  "expired_final_notice"
);
assert.equal(
  grinAccessPhase(expired, T0 + GRIN_EXPIRED_READ_EXPORT_MS + GRIN_EXPIRED_FINAL_NOTICE_MS),
  "expired_purge_eligible"
);

assert.equal(mayIssueOrUploadGrinCloud("entitled_or_free"), true);
assert.equal(mayIssueOrUploadGrinCloud("expired_read_export"), false);
assert.equal(mayIssueOrUploadGrinCloud("expired_final_notice"), false);
assert.equal(mayIssueOrUploadGrinCloud("expired_purge_eligible"), false);
assert.equal(mayReadDownloadExportGrin("expired_purge_eligible"), true);
assert.equal(90 * DAY, GRIN_EXPIRED_READ_EXPORT_MS);
assert.equal(30 * DAY, GRIN_EXPIRED_FINAL_NOTICE_MS);

console.log("entitlementLifecycle.test.ts: ok (SOURCE / INJECTED clock)");
