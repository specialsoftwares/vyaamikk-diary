/**
 * Resolved internal-auth-validation configuration.
 *
 * eas-cli 16.28.0 resolveEnvVarsAsync merges the selected EAS environment
 * under the build profile env, so the profile value wins when both define a
 * name. `eas build` sets withServerSideEnvironment to null and sends that
 * profile env on the job. This test uses the production environment names
 * and the readable string values observed for @vydspecial2026/vyaamikk-diary.
 * It does not treat the profile name as evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setSubscriptionPurchaseEntryEnabledForTests, isSubscriptionPurchaseEntryEnabled } from "@/billing/iap/purchaseEntryGate";
import { __setQuotaUpsellEnabledForTests, isQuotaUpsellEnabled } from "@/billing/quotaUpsell/quotaUpsellGate";
import { __setRuntimeSignalsForTests } from "@/config/env";
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
import { shouldShowGrinRecordsHubEntry } from "@/services/savedRecords/grinHubEntry";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const PROFILE = "internal-auth-validation";
const ADMISSION = [
  "EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED",
  "EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT",
  "EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED",
  "EXPO_PUBLIC_QUOTA_UPSELL_ENABLED",
  "EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH",
] as const;

/**
 * Production environment on EAS, read 2026-10-26. Account scope had no
 * variables. Secret values are not stored here. GOOGLE_SERVICES_JSON is a
 * secret file and was not readable; the readable client project id is below.
 */
const observedProductionNames = [
  "EXPO_PUBLIC_ACCOUNT_DELETION_URL",
  "EXPO_PUBLIC_APP_INSTALL_URL",
  "EXPO_PUBLIC_APP_MODE",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_PRIVACY_URL",
  "EXPO_PUBLIC_SUPPORT_EMAIL",
  "EXPO_PUBLIC_TERMS_URL",
  "GOOGLE_MAPS_ANDROID_API_KEY",
  "GOOGLE_SERVICES_JSON",
] as const;

const observedReadableStrings: Record<string, string> = {
  EXPO_PUBLIC_APP_MODE: "production",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "vyaamikk-diary",
  EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: "asia-south1",
};

type EasFile = {
  cli?: { appVersionSource?: string };
  build: Record<
    string,
    {
      extends?: string;
      environment?: string;
      autoIncrement?: boolean;
      distribution?: string;
      android?: { buildType?: string };
      env?: Record<string, string>;
    }
  >;
  submit?: Record<string, { android?: { track?: string; releaseStatus?: string } }>;
};

function resolveEasBuildEnv(
  server: Record<string, string>,
  profile: Record<string, string>
): Record<string, string> {
  return { ...server, ...profile };
}

const eas = JSON.parse(readFileSync(join(repoRoot, "eas.json"), "utf8")) as EasFile;
const app = JSON.parse(readFileSync(join(repoRoot, "app.json"), "utf8")) as {
  expo: { android?: { package?: string; versionCode?: number } };
};
const profile = eas.build[PROFILE];
assert.ok(profile, `${PROFILE} missing`);
assert.equal(profile.extends, undefined);
assert.equal(profile.environment, "production");
assert.equal(profile.autoIncrement, false);
assert.equal(profile.distribution, undefined);
assert.equal(profile.android?.buildType, "app-bundle");
assert.equal(eas.cli?.appVersionSource, "local");
assert.equal(app.expo.android?.package, "com.specialsoftwares.vyaamikkdiary");
assert.equal(app.expo.android?.versionCode, 32);

const profileEnv = profile.env ?? {};
assert.deepEqual(Object.keys(profileEnv).sort(), [
  "EXPO_PUBLIC_APP_MODE",
  "EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED",
  "EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT",
  "EXPO_PUBLIC_QUOTA_UPSELL_ENABLED",
  "EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED",
].sort());
for (const name of ADMISSION) {
  assert.equal(observedProductionNames.includes(name as (typeof observedProductionNames)[number]), false, name);
}

const server = { ...observedReadableStrings };
const resolved = resolveEasBuildEnv(server, profileEnv);
assert.equal(resolved.EXPO_PUBLIC_APP_MODE, "production");
assert.equal(resolved.EXPO_PUBLIC_FIREBASE_PROJECT_ID, "vyaamikk-diary");
assert.equal(resolved.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION, "asia-south1");
assert.equal(resolved.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "0");
assert.equal(resolved.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT, "0");
assert.equal(resolved.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
assert.equal(resolved.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
assert.equal(resolved.EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH, undefined);

const serverWins = { ...profileEnv, ...server };
assert.equal(serverWins.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "0");
assert.equal(serverWins.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT, "0");
assert.equal(serverWins.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
assert.equal(serverWins.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");

const hostile = resolveEasBuildEnv(
  {
    ...server,
    EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED: "1",
    EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT: "1",
    EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED: "1",
    EXPO_PUBLIC_QUOTA_UPSELL_ENABLED: "1",
    EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH: "true",
  },
  profileEnv
);
assert.equal(hostile.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "0");
assert.equal(hostile.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT, "0");
assert.equal(hostile.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
assert.equal(hostile.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
assert.equal(hostile.EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH, "true");

const grin = eas.build["internal-grin"];
assert.equal(grin?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
assert.equal(grin?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT, "1");
assert.equal(grin?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "1");

const submit = eas.submit?.[PROFILE]?.android;
assert.equal(submit?.track, "internal");
assert.equal(submit?.releaseStatus, "completed");
assert.equal(JSON.stringify(eas.submit?.[PROFILE]), JSON.stringify({ android: submit }));

const previous: Record<string, string | undefined> = {};
for (const key of Object.keys(resolved)) {
  previous[key] = process.env[key];
  process.env[key] = resolved[key];
}
for (const key of ADMISSION) {
  if (!(key in resolved)) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
}
__setRuntimeSignalsForTests({ appOwnership: "standalone", isDev: false, platform: "android" });
__setSubscriptionPurchaseEntryEnabledForTests(null);
__setQuotaUpsellEnabledForTests(null);
try {
  assert.equal(isGoodsEvidenceEnabled(), false);
  assert.equal(shouldShowGrinRecordsHubEntry(), false);
  assert.equal(isSubscriptionPurchaseEntryEnabled(), false);
  assert.equal(isQuotaUpsellEnabled(), false);
} finally {
  __setRuntimeSignalsForTests(null);
  __setSubscriptionPurchaseEntryEnabledForTests(null);
  __setQuotaUpsellEnabledForTests(null);
  for (const [key, value] of Object.entries(previous)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("goodsEvidence/internalAuthValidationProfile.test.ts: ok");
