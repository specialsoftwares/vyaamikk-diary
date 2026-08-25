import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AUTH_USER_FACING_COPY } from "@/services/auth/authUserFacingCopy";
import { shouldAutoVerifyOtp } from "@/auth-v2/otp/onboardingOtpModel";
import { hrefForIdentityRouteState, resolveIdentityRouteState } from "@/auth/identityRouteState";
import { resolveVerifiedEmailContinueAction } from "@/auth-v2/verifiedEmailContinue";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";

const root = join(__dirname, "../..");
const gateSrc = readFileSync(join(root, "src/auth-v2/AuthFlowGate.tsx"), "utf8");
const otpSrc = readFileSync(join(root, "src/auth-v2/screens/OtpVerificationScreen.tsx"), "utf8");
const emailSrc = readFileSync(join(root, "src/auth-v2/screens/EmailEntryScreen.tsx"), "utf8");

assert.match(otpSrc, /onVerifyStart/);
assert.match(gateSrc, /beginVerificationProcess\("mobile"\)/);
assert.match(gateSrc, /clearFlowError\(\)/);
assert.match(gateSrc, /errorVisibleOnSurface\(errorSurface, "email"\)/);
assert.equal(gateSrc.includes("goBackFromEmail"), false);
assert.match(gateSrc, /abandonWizardAndSignOut/);
assert.match(gateSrc, /beginPhoneOtpSend/);
assert.match(gateSrc, /isCurrentPhoneChallenge/);
assert.match(emailSrc, /showBack=\{Boolean\(onBack\)\}/);
assert.match(gateSrc, /Sending code|authV2\.phone\.sending|loading=\{loading\}/);

assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true
);

function user(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VYD-2026-TEST01",
    phoneE164: "+919999994148",
    displayName: "Test",
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    language: "en",
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { ...DEFAULT_PDF_BRANDING },
    lastLoginAt: Date.now(),
    previousLoginAt: null,
    lastActiveAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    status: "active",
    ...over,
  };
}

const phoneOnly = resolveIdentityRouteState({ signedIn: true, user: user() });
assert.equal(phoneOnly, "phoneAuthenticatedEmailMissing");
assert.equal(hrefForIdentityRouteState(phoneOnly), "/(auth)/v2?step=email");

assert.equal(
  resolveVerifiedEmailContinueAction({
    draftEmail: "a@b.co",
    verifiedEmail: "a@b.co",
    emailAuthoritativelyVerified: true,
  }),
  "proceed_without_otp"
);

assert.match(AUTH_USER_FACING_COPY.invalidOtp, /Check the SMS/);
assert.match(gateSrc, /savePendingConsent/);
assert.match(gateSrc, /void savePendingConsent\(/);
assert.equal(/await savePendingConsent\(/.test(gateSrc), false);
assert.match(gateSrc, /void saveAuthWrapperChallenge\(/);

console.log("authPerformanceCheckpoint.contract.test.ts: ok");
