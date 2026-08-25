import assert from "node:assert/strict";

import {
  isAuthoritativeMobileVerified,
  resolveAuthSystemBackAction,
  resolveEmailAuthBackPolicy,
} from "./verifiedCheckpointPolicy";

assert.equal(
  isAuthoritativeMobileVerified({
    phoneChallengeProven: true,
    signedIn: false,
    profilePhoneE164: null,
  }),
  true
);

assert.equal(
  isAuthoritativeMobileVerified({
    phoneChallengeProven: false,
    signedIn: true,
    profilePhoneE164: "+919999994148",
  }),
  true
);

assert.equal(
  isAuthoritativeMobileVerified({
    phoneChallengeProven: false,
    signedIn: false,
    profilePhoneE164: "+919999994148",
  }),
  false
);

assert.equal(
  resolveEmailAuthBackPolicy({
    mobileAuthoritativelyVerified: true,
    reviewingFromProfile: false,
  }),
  "hidden_stay",
  "Email Back does not route to Phone Entry"
);

assert.equal(
  resolveEmailAuthBackPolicy({
    mobileAuthoritativelyVerified: true,
    reviewingFromProfile: true,
  }),
  "profile_review"
);

assert.equal(
  resolveAuthSystemBackAction({
    step: "email",
    mobileAuthoritativelyVerified: true,
    emailBackPolicy: "hidden_stay",
    emailSendBlocked: false,
  }),
  "stay",
  "Android/system Back on Email respects checkpoint"
);

assert.equal(
  resolveAuthSystemBackAction({
    step: "otp",
    mobileAuthoritativelyVerified: false,
    emailBackPolicy: "hidden_stay",
    emailSendBlocked: false,
  }),
  "phone_unverified"
);

assert.equal(
  resolveAuthSystemBackAction({
    step: "email_verify",
    mobileAuthoritativelyVerified: true,
    emailBackPolicy: "hidden_stay",
    emailSendBlocked: true,
  }),
  "stay"
);

console.log("verifiedCheckpointPolicy.test.ts: ok");
