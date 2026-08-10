import assert from "node:assert/strict";

import {
  canAccessDashboard,
  hasAuthoritativeVerifiedEmail,
  hrefForIdentityRouteState,
  resolveIdentityRouteState,
} from "./identityRouteState";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";

function baseUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VYD-2026-TEST01",
    phoneE164: "+919876543210",
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

assert.equal(
  resolveIdentityRouteState({ signedIn: false, user: null }),
  "unauthenticated"
);

assert.equal(
  resolveIdentityRouteState({
    signedIn: true,
    user: baseUser(),
  }),
  "phoneAuthenticatedEmailMissing"
);

assert.equal(
  hasAuthoritativeVerifiedEmail(
    baseUser({
      businessEmail: "a@b.co",
      emailStatus: "unverified",
      emailVerifiedAt: null,
    })
  ),
  false,
  "legacy email present must NOT count as verified"
);

assert.equal(
  resolveIdentityRouteState({
    signedIn: true,
    user: baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verification_pending",
    }),
  }),
  "emailPendingVerification"
);

const verified = baseUser({
  businessEmail: "a@b.co",
  normalizedEmail: "a@b.co",
  emailStatus: "verified",
  emailVerifiedAt: Date.now(),
  profileCompletedAt: Date.now(),
  ueidReleasedAt: Date.now(),
  onboardingIntroSeenAt: Date.now(),
});

assert.equal(
  resolveIdentityRouteState({
    signedIn: true,
    user: verified,
    onboardingIncomplete: true,
  }),
  "emailVerifiedOnboardingIncomplete"
);

assert.equal(
  resolveIdentityRouteState({
    signedIn: true,
    user: verified,
    onboardingIncomplete: false,
  }),
  "fullyReady"
);

assert.equal(canAccessDashboard("fullyReady"), true);
assert.equal(canAccessDashboard("phoneAuthenticatedEmailMissing"), false);
assert.equal(canAccessDashboard("recoveryCoolingOff"), true);
assert.equal(hrefForIdentityRouteState("phoneAuthenticatedEmailMissing"), "/(auth)/v2?step=email");

const cooling = baseUser({
  ...verified,
  coolingOffUntil: Date.now() + 60_000,
});
assert.equal(
  resolveIdentityRouteState({
    signedIn: true,
    user: cooling,
    onboardingIncomplete: false,
  }),
  "recoveryCoolingOff"
);

console.log("identityRouteState.test.ts: ok");
