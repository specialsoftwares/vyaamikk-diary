import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { featuresForPlan } from "./subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "./types";
import {
  androidProductIdForPlan,
  billingDetailsInvoiceReady,
  interpretQuotaUsage,
  managementPendingKind,
  managementQuotaView,
} from "./subscriptionManagementPresentation";
import {
  formatHistoryAmountInr,
  parseBillingHistoryDoc,
} from "./billingHistoryPresentation";
import { isKnownGstStateCode } from "./gstStates";
import { playSubscriptionsManageUrl } from "../billing/iap/playSubscriptionsUrl";
import { parseQuotaUsageData } from "./quotaUsageReader";
import { youDashboardQuotaWarning } from "./youDashboardQuotaWarning";

const SEP_2026_MS = Date.UTC(2026, 8, 15, 6, 0, 0);

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
    usage: { kind: "ok", monthKey: "2026-09", recordsThisMonth: 3 },
    nowMs: SEP_2026_MS,
  });
  assert.equal(unlimited.kind, "unlimited");
  const capped = managementQuotaView({
    features: featuresForPlan("free"),
    usage: { kind: "ok", monthKey: "2026-09", recordsThisMonth: 4 },
    nowMs: SEP_2026_MS,
  });
  assert.equal(capped.kind, "capped");
  if (capped.kind === "capped") {
    assert.equal(capped.used, 4);
    assert.equal(capped.limit, 25);
    assert.equal(capped.warnAt80, false);
    assert.equal(capped.currency.kind, "current");
  }
  assert.equal(
    managementQuotaView({
      features: featuresForPlan("free"),
      usage: { kind: "unavailable", code: "permission-denied" },
      nowMs: SEP_2026_MS,
    }).kind,
    "unavailable"
  );
}

{
  assert.equal(parseQuotaUsageData({ monthKey: "2026-08", recordsThisMonth: 25 }).kind, "ok");
  assert.equal(parseQuotaUsageData({ monthKey: "2026-8", recordsThisMonth: 1 }).kind, "malformed");
  assert.equal(parseQuotaUsageData({ monthKey: "2026-09", recordsThisMonth: -1 }).kind, "malformed");
  assert.equal(parseQuotaUsageData({ monthKey: "2026-09", recordsThisMonth: 1.5 }).kind, "malformed");

  const prior = interpretQuotaUsage({
    read: { kind: "ok", monthKey: "2026-08", recordsThisMonth: 25 },
    nowMs: SEP_2026_MS,
  });
  assert.equal(prior.kind, "prior_month");
  const priorView = managementQuotaView({
    features: featuresForPlan("free"),
    usage: { kind: "ok", monthKey: "2026-08", recordsThisMonth: 25 },
    nowMs: SEP_2026_MS,
  });
  assert.equal(priorView.kind, "capped");
  if (priorView.kind === "capped") {
    assert.equal(priorView.used, null);
    assert.equal(priorView.warnAt80, false);
    assert.equal(priorView.currency.kind, "prior_month");
  }

  const warn = managementQuotaView({
    features: featuresForPlan("free"),
    usage: { kind: "ok", monthKey: "2026-09", recordsThisMonth: 20 },
    nowMs: SEP_2026_MS,
  });
  assert.equal(warn.kind, "capped");
  if (warn.kind === "capped") assert.equal(warn.warnAt80, true);
  assert.equal(
    youDashboardQuotaWarning({
      features: featuresForPlan("free"),
      usage: { kind: "ok", monthKey: "2026-09", recordsThisMonth: 20 },
      nowMs: SEP_2026_MS,
    }).kind,
    "warn80"
  );
  assert.equal(
    youDashboardQuotaWarning({
      features: featuresForPlan("free"),
      usage: { kind: "ok", monthKey: "2026-08", recordsThisMonth: 25 },
      nowMs: SEP_2026_MS,
    }).kind,
    "none"
  );
  assert.equal(
    youDashboardQuotaWarning({
      features: featuresForPlan("professional"),
      usage: { kind: "ok", monthKey: "2026-09", recordsThisMonth: 20 },
      nowMs: SEP_2026_MS,
    }).kind,
    "none"
  );

  assert.equal(
    billingDetailsInvoiceReady({
      billingRecipientName: "A",
      billingAddressLine1: "1 Road",
      billingPostalCode: "400001",
      billingStateCode: "27",
    }),
    true
  );
  assert.equal(
    billingDetailsInvoiceReady({
      billingRecipientName: "A",
      billingAddressLine1: "",
      billingPostalCode: "400001",
      billingStateCode: "27",
    }),
    false
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
  assert.match(screen, /createSubscriptionManagementRuntime/);
  assert.match(screen, /maskManagementSnapshot/);
  assert.match(screen, /liveSession/);
  assert.match(screen, /restorePurchases/);
  assert.match(screen, /saveBillingDetailsClient/);
  assert.match(screen, /isSubscriptionPurchaseEntryEnabled/);
  assert.match(screen, /quotaWarn80/);
  assert.doesNotMatch(screen, /grantProfessionalTrial/);
  assert.doesNotMatch(screen, /\bsetDoc\b/);
  assert.doesNotMatch(screen, /from ["']expo-iap["']/);
  assert.doesNotMatch(screen, /billingStatus\s*===/);
  assert.doesNotMatch(screen, /trialEndsAt/);
  assert.doesNotMatch(screen, /gracePeriodEndsAt/);
  const youTab = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../app/(app)/(tabs)/you.tsx"),
    "utf8"
  );
  assert.match(youTab, /youDashboardQuotaWarning/);
  assert.match(youTab, /quotaWarn80/);
  assert.match(youTab, /settings\/subscription/);
  assert.doesNotMatch(youTab, /notifyManualUpgrade/);
  assert.doesNotMatch(youTab, /presentUpgrade/);
  assert.doesNotMatch(youTab, /EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED/);
  const detailsClient = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../billing/iap/billingDetailsClient.ts"),
    "utf8"
  );
  assert.match(detailsClient, /updateBillingDetails/);
  assert.doesNotMatch(detailsClient, /\bsetDoc\b/);
}

console.log("subscriptionManagement.presentation.test.ts: ok");
