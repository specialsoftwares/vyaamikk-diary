import assert from "node:assert/strict";

import {
  phoneFallbackMayClaimSessionExpired,
  resolveAuthFlowGateRenderBranch,
} from "./authFlowGateRenderDecision";

// --- Happy paths ---
assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: false,
    status: "loading",
    step: "phone",
    challengePresent: false,
    phoneE164Present: false,
    mobileVerifyInFlight: false,
  }),
  "boot"
);

assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_out",
    step: "phone",
    challengePresent: false,
    phoneE164Present: true,
    mobileVerifyInFlight: false,
  }),
  "phone_confirm"
);

assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_out",
    step: "otp",
    challengePresent: true,
    phoneE164Present: true,
    mobileVerifyInFlight: false,
  }),
  "otp"
);

assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_in",
    step: "email",
    challengePresent: false,
    phoneE164Present: true,
    mobileVerifyInFlight: false,
  }),
  "email"
);

// --- Stage 8 regression: challenge cleared before setStep("email") ---
assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_in",
    step: "otp",
    challengePresent: false,
    phoneE164Present: true,
    mobileVerifyInFlight: true,
  }),
  "otp_transition",
  "NEW USER post-auth: must not bounce to phone while verify in flight"
);

assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_in",
    step: "otp",
    challengePresent: false,
    phoneE164Present: true,
    mobileVerifyInFlight: false,
  }),
  "otp_transition",
  "phoneE164 still present → transition, not sessionExpired phone"
);

// Returning path: already on email
assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_in",
    step: "email",
    challengePresent: false,
    phoneE164Present: true,
    mobileVerifyInFlight: false,
  }),
  "email"
);

// Bridge/commit delay: still otp, challenge kept until email step
assert.equal(
  resolveAuthFlowGateRenderBranch({
    hydrated: true,
    status: "signed_in",
    step: "otp",
    challengePresent: true,
    phoneE164Present: true,
    mobileVerifyInFlight: true,
  }),
  "otp"
);

// Genuine signed-out fallback may claim expiry; signed_in must not.
assert.equal(
  phoneFallbackMayClaimSessionExpired({ status: "signed_out", explicitSessionExpired: false }),
  true
);
assert.equal(
  phoneFallbackMayClaimSessionExpired({ status: "signed_in", explicitSessionExpired: false }),
  false,
  "signed_in must not show false sessionExpired"
);
assert.equal(
  phoneFallbackMayClaimSessionExpired({ status: "signed_in", explicitSessionExpired: true }),
  true
);

console.log("authFlowGateRenderDecision.test.ts: ok");
