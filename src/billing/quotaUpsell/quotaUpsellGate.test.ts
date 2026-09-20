import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { isQuotaUpsellEnabled, __setQuotaUpsellEnabledForTests } from "./quotaUpsellGate";

const prev = process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED;
delete process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED;
__setQuotaUpsellEnabledForTests(null);

assert.equal(isQuotaUpsellEnabled(), false, "unset env must stay off");

process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED = "true";
assert.equal(isQuotaUpsellEnabled(), false, "non-1 values must stay off");

process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED = "1";
assert.equal(isQuotaUpsellEnabled(), true);

__setRuntimeSignalsForTests({
  appOwnership: "standalone",
  isDev: false,
  platform: "android",
});
process.env.EXPO_PUBLIC_APP_MODE = "production";
delete process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED;
__setQuotaUpsellEnabledForTests(null);
assert.equal(
  isQuotaUpsellEnabled(),
  false,
  "production standalone must not enable quota upsell by default"
);
__setRuntimeSignalsForTests(null);

if (prev == null) delete process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED;
else process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED = prev;

console.log("quotaUpsellGate.test.ts: ok");
