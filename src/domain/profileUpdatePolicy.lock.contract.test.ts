import assert from "node:assert/strict";

import {
  canEditProfileField,
  isOnboardingIdentityLocked,
} from "@/domain/profileUpdatePolicy";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";

function baseUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VYD-2026-ABCDEF",
    phoneE164: "+919876543210",
    displayName: "Ada",
    salutation: null,
    businessName: "Ada Co",
    workType: null,
    designation: null,
    businessEmail: "a@b.co",
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

// Before profile completion — drafts remain editable on Business Identity.
assert.equal(isOnboardingIdentityLocked(baseUser()), false);
assert.equal(
  isOnboardingIdentityLocked(baseUser({ profileCompletedAt: null, ueidReleasedAt: null })),
  false
);

// Failed completion (no profileCompletedAt) does not lock.
assert.equal(isOnboardingIdentityLocked(baseUser({ profileCompletedAt: null })), false);

// After authoritative profile completion — onboarding identity screen locks.
assert.equal(isOnboardingIdentityLocked(baseUser({ profileCompletedAt: 1 })), true);

// Existing users with historical ueidReleasedAt remain locked even if oddly missing profileCompletedAt.
assert.equal(
  isOnboardingIdentityLocked(baseUser({ profileCompletedAt: null, ueidReleasedAt: 1 })),
  true
);

// Old all-complete users remain locked.
assert.equal(
  isOnboardingIdentityLocked(baseUser({ profileCompletedAt: 1, ueidReleasedAt: 1 })),
  true
);

// Settings-style limited fields remain governed by change counts, not the onboarding lock.
const completed = baseUser({ profileCompletedAt: 1 });
assert.equal(canEditProfileField(completed, "displayName").allowed, true);
assert.equal(canEditProfileField(completed, "salutation").allowed, true);
assert.equal(canEditProfileField(completed, "businessName").allowed, true);
assert.equal(
  canEditProfileField(
    baseUser({ profileCompletedAt: 1, businessNameChangeCount: 2 }),
    "businessName"
  ).allowed,
  false
);

console.log("profileUpdatePolicy.lock.contract.test.ts: ok");
