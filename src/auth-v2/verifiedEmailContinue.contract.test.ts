import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveVerifiedEmailContinueAction,
  shouldHonorReviewIntentSuppression,
} from "@/auth-v2/verifiedEmailContinue";

const root = join(__dirname, "../..");

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "owner@example.com",
    verifiedEmail: "owner@example.com",
    emailAuthoritativelyVerified: false,
  }),
  "send_verification"
);

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "owner@example.com",
    verifiedEmail: "owner@example.com",
    emailAuthoritativelyVerified: true,
  }),
  "proceed_without_otp"
);

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "owner@example.com",
    verifiedEmail: "owner@example.com",
    emailAuthoritativelyVerified: true,
  }),
  "proceed_without_otp",
  "verified unchanged — including Review re-entry"
);

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "new@example.com",
    verifiedEmail: "owner@example.com",
    emailAuthoritativelyVerified: true,
  }),
  "send_verification"
);

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "",
    verifiedEmail: "owner@example.com",
    emailAuthoritativelyVerified: true,
  }),
  "invalid"
);

assert.equal(
  shouldHonorReviewIntentSuppression({
    userInitiatedContinue: true,
    reviewIntentActive: true,
  }),
  false,
  "user Continue must not no-op because review intent is set"
);
assert.equal(
  shouldHonorReviewIntentSuppression({
    userInitiatedContinue: false,
    reviewIntentActive: true,
  }),
  true
);

const gate = readFileSync(join(root, "src/auth-v2/AuthFlowGate.tsx"), "utf8");
assert.match(gate, /resolveVerifiedEmailContinueAction/);
assert.match(gate, /goToBusinessIdentity\(\{ userInitiated: true \}\)/);
assert.match(gate, /if \(!opts\?\.userInitiated && isReviewIntentActive\(\)\)/);

console.log("verifiedEmailContinue.contract.test.ts: ok");
