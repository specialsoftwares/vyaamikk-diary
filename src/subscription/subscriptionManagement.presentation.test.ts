import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { featuresForPlan } from "./subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "./types";
import {
  androidProductIdForPlan,
  managementPendingKind,
  managementQuotaView,
} from "./subscriptionManagementPresentation";
import {
  formatHistoryAmountInr,
  parseBillingHistoryDoc,
} from "./billingHistoryPresentation";
import { isKnownGstStateCode } from "./gstStates";
import { playSubscriptionsManageUrl } from "../billing/iap/playSubscriptionsUrl";

{
  assert.equal(androidProductIdForPlan("starter"), "vyd_starter");
  assert.equal(androidProductIdForPlan("free"), null);
  assert.match(playSubscriptionsManageUrl("starter"), /package=com\.specialsoftwares\.vyaamikkdiary/);
  assert.match(playSubscriptionsManageUrl("starter"), /sku=vyd_starter/);
  assert.doesNotMatch(playSubscriptionsManageUrl("free"), /sku=/);
}

{
  const cancelled = managementPendingKind({
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    entitlementReason: "cancelledPeriodRemaining",
    entitlementActive: true,
  });
  assert.equal(cancelled, "cancelled_remaining");
  const unlimited = managementQuotaView({
    features: featuresForPlan("professional"),
    recordsThisMonth: 3,
    usageReadable: true,
  });
  assert.equal(unlimited.kind, "unlimited");
  const capped = managementQuotaView({
    features: featuresForPlan("free"),
    recordsThisMonth: 4,
    usageReadable: true,
  });
  assert.equal(capped.kind, "capped");
  if (capped.kind === "capped") {
    assert.equal(capped.used, 4);
    assert.equal(capped.limit, 25);
  }
  assert.equal(
    managementQuotaView({
      features: featuresForPlan("free"),
      recordsThisMonth: null,
      usageReadable: false,
    }).kind,
    "unavailable"
  );
}

{
  const parsed = parseBillingHistoryDoc("evt-1", {
    type: "purchaseActivated",
    occurredAt: 1,
    planAfter: "starter",
    canonicalSku: "vyd_starter_monthly",
    amountInPaise: 9900,
    currency: "INR",
    purchaseToken: "secret-token",
  });
  assert.ok(parsed);
  assert.equal(parsed?.amountInPaise, 9900);
  assert.equal(formatHistoryAmountInr(9900), "₹99.00");
  assert.equal("purchaseToken" in (parsed ?? {}), false);
  assert.equal(parseBillingHistoryDoc("bad", { type: "unknown", occurredAt: 1 }), null);
}

assert.equal(isKnownGstStateCode("27"), true);
assert.equal(isKnownGstStateCode("MH"), false);

{
  const screen = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/billing/SubscriptionManagementScreen.tsx"),
    "utf8"
  );
  assert.match(screen, /notifyManualUpgrade/);
  assert.match(screen, /restorePurchases/);
  assert.match(screen, /saveBillingDetailsClient/);
  assert.doesNotMatch(screen, /grantProfessionalTrial/);
  assert.doesNotMatch(screen, /\bsetDoc\b/);
  assert.doesNotMatch(screen, /from ["']expo-iap["']/);
  assert.doesNotMatch(screen, /billingStatus\s*===/);
  assert.doesNotMatch(screen, /trialEndsAt/);
  assert.doesNotMatch(screen, /gracePeriodEndsAt/);
  const detailsClient = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../billing/iap/billingDetailsClient.ts"),
    "utf8"
  );
  assert.match(detailsClient, /updateBillingDetails/);
  assert.doesNotMatch(detailsClient, /\bsetDoc\b/);
}

console.log("subscriptionManagement.presentation.test.ts: ok");
