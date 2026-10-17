/**
 * Play billing enablement + fail-closed tester UID allowlist.
 * Does not enable billing. Does not invent owner tester emails/UIDs.
 * Already-owned expire/refund/restore after delist is proven in
 * androidPlay.unit.test.ts (not a voided-function source-string check).
 * Run: npm run test:billing-play-constants
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BillingError } from "../errors";
import {
  assertPlayBillingNewGrantAllowedIfEnforced,
  assertPlayBillingTesterAllowed,
  assertPlayBillingTesterAllowedIfEnforced,
  isPlayBillingEnabled,
  PLAY_RTDN_PUSH_AUDIENCE_URL,
  PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL,
  playPurchaseAllowedForAuthUid,
  isPlayBillingTesterAllowed,
  playBillingTesterUidAllowlist,
} from "./playConstants";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

assert.equal(isPlayBillingEnabled({}), false);
assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "false" }), false);
assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "TRUE" }), false);
assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "true" }), true);

assert.equal(playBillingTesterUidAllowlist({}).size, 0);
assert.equal(playBillingTesterUidAllowlist({ PLAY_BILLING_TESTER_UIDS: "" }).size, 0);
assert.equal(playBillingTesterUidAllowlist({ PLAY_BILLING_TESTER_UIDS: " , , " }).size, 0);
assert.equal(isPlayBillingTesterAllowed("uid-owner", {}), false);
assert.equal(isPlayBillingTesterAllowed("", { PLAY_BILLING_TESTER_UIDS: "uid-owner" }), false);

const listed = playBillingTesterUidAllowlist({
  PLAY_BILLING_TESTER_UIDS: " uid-a ,uid-b, uid-a ",
});
assert.equal(listed.size, 2);
assert.equal(listed.has("uid-a"), true);
assert.equal(listed.has("uid-b"), true);
assert.equal(isPlayBillingTesterAllowed("uid-a", { PLAY_BILLING_TESTER_UIDS: "uid-a,uid-b" }), true);
assert.equal(isPlayBillingTesterAllowed("uid-c", { PLAY_BILLING_TESTER_UIDS: "uid-a,uid-b" }), false);

const jsonArray = playBillingTesterUidAllowlist({
  PLAY_BILLING_TESTER_UIDS: '["uid-a", "uid-b"]',
});
assert.equal(jsonArray.size, 2);
assert.equal(jsonArray.has("uid-a"), true);

const jsonObject = playBillingTesterUidAllowlist({
  PLAY_BILLING_TESTER_UIDS: '{"uids":["uid-a","uid-b"]}',
});
assert.equal(jsonObject.has("uid-a"), true);
assert.equal(
  playBillingTesterUidAllowlist({
    PLAY_BILLING_TESTER_UIDS: '{"firebaseUids":["uid-z"]}',
  }).has("uid-z"),
  true
);
assert.equal(
  playBillingTesterUidAllowlist({
    PLAY_BILLING_TESTER_UIDS: '{"testerUids":"uid-solo"}',
  }).has("uid-solo"),
  true
);
assert.equal(
  playBillingTesterUidAllowlist({
    PLAY_BILLING_TESTER_UIDS: '{"PLAY_BILLING_TESTER_UIDS":["uid-env"]}',
  }).has("uid-env"),
  true
);
assert.equal(
  playBillingTesterUidAllowlist({
    PLAY_BILLING_TESTER_UIDS: '{"emails":["tester@example.com"]}',
  }).size,
  0
);
assert.equal(
  playBillingTesterUidAllowlist({
    PLAY_BILLING_TESTER_UIDS: "{}",
  }).size,
  0
);

assert.throws(
  () =>
    playBillingTesterUidAllowlist({
      PLAY_BILLING_TESTER_UIDS: '{"uids":[',
    }),
  isCause("play_billing_tester_allowlist_malformed")
);
assert.throws(
  () =>
    playBillingTesterUidAllowlist({
      PLAY_BILLING_TESTER_UIDS: '{"uids":{"nested":true}}',
    }),
  isCause("play_billing_tester_allowlist_malformed")
);
assert.throws(
  () =>
    playBillingTesterUidAllowlist({
      PLAY_BILLING_TESTER_UIDS: '["ok","not-an-email@x.com"]',
    }),
  isCause("play_billing_tester_allowlist_email_not_uid")
);
assert.throws(
  () =>
    playBillingTesterUidAllowlist({
      PLAY_BILLING_TESTER_UIDS: "uid-ok,tester@example.com",
    }),
  isCause("play_billing_tester_allowlist_email_not_uid")
);

assert.throws(
  () => assertPlayBillingTesterAllowed("uid-a", {}),
  isCause("play_billing_tester_not_allowlisted")
);
assert.throws(
  () =>
    assertPlayBillingTesterAllowed("uid-c", {
      PLAY_BILLING_ENABLED: "true",
      PLAY_BILLING_TESTER_UIDS: "uid-a",
    }),
  isCause("play_billing_tester_not_allowlisted")
);
assert.doesNotThrow(() =>
  assertPlayBillingTesterAllowed("uid-a", { PLAY_BILLING_TESTER_UIDS: "uid-a" })
);
assert.doesNotThrow(() =>
  assertPlayBillingTesterAllowed("uid-a", {
    PLAY_BILLING_TESTER_UIDS: '{"uids":["uid-a"]}',
  })
);

assert.doesNotThrow(() =>
  assertPlayBillingTesterAllowedIfEnforced("any", false, {})
);
assert.throws(
  () => assertPlayBillingTesterAllowedIfEnforced("any", true, {}),
  isCause("play_billing_tester_not_allowlisted")
);

assert.doesNotThrow(() => assertPlayBillingNewGrantAllowedIfEnforced(false, {}));
assert.doesNotThrow(() => assertPlayBillingNewGrantAllowedIfEnforced(undefined, {}));
assert.doesNotThrow(() =>
  assertPlayBillingNewGrantAllowedIfEnforced(true, { PLAY_BILLING_ENABLED: "true" })
);
assert.throws(
  () => assertPlayBillingNewGrantAllowedIfEnforced(true, {}),
  (err: unknown) => {
    assert.equal(isCause("play_billing_disabled")(err), true);
    assert.equal(err instanceof BillingError && err.retryable, true);
    return true;
  }
);
assert.throws(
  () =>
    assertPlayBillingNewGrantAllowedIfEnforced(true, { PLAY_BILLING_ENABLED: "false" }),
  isCause("play_billing_disabled")
);
assert.throws(
  () =>
    assertPlayBillingNewGrantAllowedIfEnforced(true, { PLAY_BILLING_ENABLED: "TRUE" }),
  isCause("play_billing_disabled")
);

const enabledButEmptyAllowlist = {
  PLAY_BILLING_ENABLED: "true",
} as NodeJS.ProcessEnv;
assert.equal(isPlayBillingEnabled(enabledButEmptyAllowlist), true);
assert.equal(isPlayBillingTesterAllowed("any-uid", enabledButEmptyAllowlist), false);
assert.equal(playPurchaseAllowedForAuthUid("uid-a", {}), false);
assert.equal(
  playPurchaseAllowedForAuthUid("uid-a", {
    PLAY_BILLING_ENABLED: "true",
    PLAY_BILLING_TESTER_UIDS: "uid-a",
  }),
  true
);
assert.equal(
  playPurchaseAllowedForAuthUid("uid-b", {
    PLAY_BILLING_ENABLED: "true",
    PLAY_BILLING_TESTER_UIDS: "uid-a",
  }),
  false
);
assert.equal(
  playPurchaseAllowedForAuthUid("uid-a", {
    PLAY_BILLING_ENABLED: "false",
    PLAY_BILLING_TESTER_UIDS: "uid-a",
  }),
  false
);
assert.equal(
  playPurchaseAllowedForAuthUid("", {
    PLAY_BILLING_ENABLED: "true",
    PLAY_BILLING_TESTER_UIDS: "uid-a",
  }),
  false
);
assert.throws(
  () =>
    playPurchaseAllowedForAuthUid("uid-a", {
      PLAY_BILLING_ENABLED: "true",
      PLAY_BILLING_TESTER_UIDS: "tester@example.com",
    }),
  isCause("play_billing_tester_allowlist_email_not_uid")
);

const prepareSrc = readFileSync(
  resolve(__dirname, "../callables/prepareAndroidBillingAccount.ts"),
  "utf8"
);
const validateSrc = readFileSync(
  resolve(__dirname, "../callables/validateAndActivateAndroid.ts"),
  "utf8"
);
const rtdnSrc = readFileSync(resolve(__dirname, "../callables/androidRtdn.ts"), "utf8");
const reconSrc = readFileSync(
  resolve(__dirname, "../scheduled/billingReconciliation.ts"),
  "utf8"
);
const adapterSrc = readFileSync(
  resolve(__dirname, "./androidSubscriptionAdapter.ts"),
  "utf8"
);

for (const [name, src] of [
  ["prepareAndroidBillingAccount", prepareSrc],
] as const) {
  const enabledIdx = src.indexOf("isPlayBillingEnabled()");
  const allowIdx = src.indexOf("assertPlayBillingTesterAllowed(request.auth.uid)");
  assert.ok(enabledIdx >= 0, `${name} must check PLAY_BILLING_ENABLED`);
  assert.ok(allowIdx >= 0, `${name} must assert the tester allowlist for new Play-account bind`);
  assert.ok(
    enabledIdx < allowIdx,
    `${name} must keep the allowlist behind PLAY_BILLING_ENABLED`
  );
}

assert.equal(
  validateSrc.includes("if (!isPlayBillingEnabled())"),
  false,
  "validateAndActivateAndroid must not blanket-close already-owned restore"
);
assert.equal(
  validateSrc.includes("assertPlayBillingTesterAllowed(request.auth.uid)"),
  false,
  "validate must not pre-assert allowlist; already-owned restore is adapter-gated"
);

assert.ok(validateSrc.includes("enforceRestrictedTesters: true"));
assert.ok(validateSrc.includes("enforcePlayBillingAdmission: true"));
assert.ok(rtdnSrc.includes("enforceRestrictedTesters: true"));
assert.ok(rtdnSrc.includes("enforcePlayBillingAdmission: true"));
assert.equal(
  rtdnSrc.includes('causeCode: "play_billing_disabled"'),
  false,
  "androidRtdn must not reject the whole push when new admission is closed"
);
assert.ok(reconSrc.includes("enforceRestrictedTesters: true"));
assert.ok(reconSrc.includes("enforcePlayBillingAdmission: true"));
assert.equal(
  reconSrc.includes('configurationDisabled("play_billing_disabled")'),
  false,
  "scheduled reconciliation must keep revalidating already-owned Play purchases"
);
assert.equal(
  reconSrc.includes("isPlayBillingEnabled()"),
  false,
  "PLAY_BILLING_ENABLED must not choose the android revalidator"
);
assert.ok(adapterSrc.includes("assertPlayBillingTesterAllowedIfEnforced"));
assert.ok(adapterSrc.includes("assertPlayBillingNewGrantAllowedIfEnforced"));
assert.ok(adapterSrc.includes("alreadyOwnsSameUidPurchaseToken"));
const ownsIdx = adapterSrc.indexOf(
  "if (!alreadyOwnsSameUidPurchaseToken(company, uid, fp))"
);
const admissionIdx = adapterSrc.indexOf(
  "assertPlayBillingNewGrantAllowedIfEnforced",
  Math.max(ownsIdx, 0)
);
const testerIdx = adapterSrc.indexOf(
  "assertPlayBillingTesterAllowedIfEnforced",
  Math.max(ownsIdx, 0)
);
assert.ok(
  ownsIdx >= 0 && admissionIdx > ownsIdx && testerIdx > admissionIdx,
  "new-grant admission and tester checks stay behind already-owned token ownership"
);
assert.equal(adapterSrc.includes("processAndroidVoidedPurchase"), true);

const admissionSrc = readFileSync(
  resolve(__dirname, "../callables/getPlayPurchaseAdmission.ts"),
  "utf8"
);
assert.match(admissionSrc, /playPurchaseAllowedForAuthUid/);
assert.match(admissionSrc, /purchaseAllowed/);
assert.match(admissionSrc, /asia-south1/);
assert.match(admissionSrc, /request\.auth\?\.uid/);
assert.doesNotMatch(admissionSrc, /PLAY_BILLING_TESTER_UIDS|testerUids|allowlist/);
assert.equal(admissionSrc.includes("PLAY_BILLING_ENABLED=true"), false);

assert.equal(prepareSrc.includes("PLAY_BILLING_ENABLED=true"), false);
assert.equal(validateSrc.includes("PLAY_BILLING_ENABLED=true"), false);
assert.equal(rtdnSrc.includes("PLAY_BILLING_ENABLED=true"), false);

const iosValidateSrc = readFileSync(
  resolve(__dirname, "../callables/validateAndActivateIOS.ts"),
  "utf8"
);
const assnSrc = readFileSync(
  resolve(__dirname, "../callables/appStoreServerNotificationsV2.ts"),
  "utf8"
);
const retrySrc = readFileSync(
  resolve(__dirname, "../callables/retryReconciliationWorkItem.ts"),
  "utf8"
);
const secretsSrc = readFileSync(resolve(__dirname, "../secrets.ts"), "utf8");
assert.match(secretsSrc, /defineSecret\("BILLING_DIAG_UID_SECRET"\)/);
assert.match(secretsSrc, /BILLING_DIAG_RUNTIME_SECRETS/);

for (const [name, src] of [
  ["validateAndActivateAndroid", validateSrc],
  ["androidRtdn", rtdnSrc],
  ["scheduledBillingReconciliation", reconSrc],
  ["validateAndActivateIOS", iosValidateSrc],
  ["appStoreServerNotificationsV2", assnSrc],
] as const) {
  assert.match(src, /process\.env\.BILLING_DIAG_UID_SECRET/, `${name} reads the diagnostic secret`);
  assert.match(
    src,
    /secrets:\s*BILLING_DIAG_RUNTIME_SECRETS/,
    `${name} must bind BILLING_DIAG_UID_SECRET`
  );
}

for (const [name, src] of [
  ["prepareAndroidBillingAccount", prepareSrc],
  ["retryReconciliationWorkItem", retrySrc],
  ["getPlayPurchaseAdmission", admissionSrc],
] as const) {
  assert.equal(src.includes("BILLING_DIAG_UID_SECRET"), false, `${name} does not consume the secret`);
  assert.equal(
    src.includes("BILLING_DIAG_RUNTIME_SECRETS"),
    false,
    `${name} must not bind an unused secret`
  );
}

assert.match(reconSrc, /defineString\("BILLING_RECONCILIATION_ENABLED"/);
assert.match(reconSrc, /default:\s*"false"/);
assert.match(reconSrc, /billingReconciliationEnabled\.value\(\)\s*!==\s*"true"/);
assert.equal(reconSrc.includes('BILLING_RECONCILIATION_ENABLED=true'), false);
assert.equal(reconSrc.includes('default: "true"'), false);

assert.equal(
  PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL,
  "play-rtdn-push@vyaamikk-diary.iam.gserviceaccount.com"
);
assert.equal(
  PLAY_RTDN_PUSH_AUDIENCE_URL,
  "https://asia-south1-vyaamikk-diary.cloudfunctions.net/androidRtdn"
);
assert.match(rtdnSrc, /invoker:\s*PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL/);
assert.match(rtdnSrc, /playRtdnPushAudience\.value\(\)/);
assert.match(rtdnSrc, /playRtdnPushServiceAccount\.value\(\)/);
assert.match(rtdnSrc, /defineString\("PLAY_RTDN_PUSH_AUDIENCE"/);
assert.match(rtdnSrc, /defineString\("PLAY_RTDN_PUSH_SERVICE_ACCOUNT"/);

const indexes = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../firestore.indexes.json"), "utf8")
) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }>;
};
function hasComposite(collectionGroup: string, fieldPaths: string[]): boolean {
  return indexes.indexes.some(
    (index) =>
      index.collectionGroup === collectionGroup &&
      JSON.stringify(index.fields.map((field) => field.fieldPath)) === JSON.stringify(fieldPaths)
  );
}
assert.equal(
  hasComposite("_billingReconciliationQueue", ["status", "nextAttemptAt"]),
  true,
  "pending/failed_retryable queue scan needs status + nextAttemptAt"
);
assert.equal(
  hasComposite("_billingReconciliationQueue", ["status", "leaseExpiresAt"]),
  true,
  "leased queue scan needs status + leaseExpiresAt"
);
assert.equal(
  hasComposite("_billingEventLedger", ["monthKey", "__name__"]),
  true,
  "month report orders document id after monthKey"
);

console.log("playConstants.unit.test.ts: ok");
