/**
 * Play billing enablement + fail-closed tester UID allowlist.
 * Does not enable billing. Does not invent owner tester emails/UIDs.
 * Run: npm run test:billing-play-constants
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BillingError } from "../errors";
import {
  assertPlayBillingTesterAllowed,
  isPlayBillingEnabled,
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

const enabledButEmptyAllowlist = {
  PLAY_BILLING_ENABLED: "true",
} as NodeJS.ProcessEnv;
assert.equal(isPlayBillingEnabled(enabledButEmptyAllowlist), true);
assert.equal(isPlayBillingTesterAllowed("any-uid", enabledButEmptyAllowlist), false);

const prepareSrc = readFileSync(
  resolve(__dirname, "../callables/prepareAndroidBillingAccount.ts"),
  "utf8"
);
const validateSrc = readFileSync(
  resolve(__dirname, "../callables/validateAndActivateAndroid.ts"),
  "utf8"
);
const rtdnSrc = readFileSync(resolve(__dirname, "../callables/androidRtdn.ts"), "utf8");

for (const [name, src] of [
  ["prepareAndroidBillingAccount", prepareSrc],
  ["validateAndActivateAndroid", validateSrc],
] as const) {
  const enabledIdx = src.indexOf("isPlayBillingEnabled()");
  const allowIdx = src.indexOf("assertPlayBillingTesterAllowed(request.auth.uid)");
  assert.ok(enabledIdx >= 0, `${name} must check PLAY_BILLING_ENABLED`);
  assert.ok(allowIdx >= 0, `${name} must assert the tester allowlist`);
  assert.ok(
    enabledIdx < allowIdx,
    `${name} must keep the allowlist behind PLAY_BILLING_ENABLED`
  );
}

assert.equal(rtdnSrc.includes("assertPlayBillingTesterAllowed"), false);
assert.ok(rtdnSrc.includes("isPlayBillingEnabled()"));

assert.equal(prepareSrc.includes("PLAY_BILLING_ENABLED=true"), false);
assert.equal(validateSrc.includes("PLAY_BILLING_ENABLED=true"), false);

console.log("playConstants.unit.test.ts: ok");
