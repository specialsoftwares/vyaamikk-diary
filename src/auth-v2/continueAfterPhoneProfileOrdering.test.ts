/**
 * Documents the Stage-8 invariant for continueAfterPhoneProfile ordering.
 * (Implementation lives in AuthFlowGate; this guards the contract.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "AuthFlowGate.tsx"), "utf8");

const start = src.indexOf("const continueAfterPhoneProfile");
assert.ok(start >= 0, "continueAfterPhoneProfile present");
const fnEnd = src.indexOf("const handleVerifyOtp", start);
const window = src.slice(start, fnEnd > start ? fnEnd : start + 2500);

const applyIdx = window.indexOf("await applyServerProfile");
assert.ok(applyIdx >= 0, "applyServerProfile present");

// Must not clear challenge before applyServerProfile (the Stage-8 await-gap race).
const firstClear = window.indexOf("setChallenge(null)");
assert.ok(firstClear >= 0);
assert.ok(
  firstClear > applyIdx,
  "setChallenge(null) must not precede applyServerProfile"
);

// Unverified-email path: setStep("email") then clear challenge.
const emailPath = window.indexOf('setStep("email")');
assert.ok(emailPath >= 0, "setStep(email) present");
const clearAfterEmail = window.indexOf("setChallenge(null)", emailPath);
assert.ok(clearAfterEmail > emailPath, "challenge cleared after setStep(email)");

// No early clear at the top of the function (before apply).
const beforeApply = window.slice(0, applyIdx);
assert.equal(
  beforeApply.includes("setChallenge(null)"),
  false,
  "no setChallenge(null) before applyServerProfile"
);

console.log("continueAfterPhoneProfileOrdering.test.ts: ok");
