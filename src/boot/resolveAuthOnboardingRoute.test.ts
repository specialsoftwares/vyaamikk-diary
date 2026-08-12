import assert from "node:assert/strict";

import { resolveAuthOnboardingHref } from "@/boot/resolveAuthOnboardingRoute";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";

function baseUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VYD-2026-ABCDEF",
    phoneE164: "+919876543210",
    displayName: "Ada Lovelace",
    salutation: null,
    businessName: "Ada Co",
    workType: null,
    designation: null,
    businessEmail: "a@b.co",
    normalizedEmail: "a@b.co",
    emailStatus: "verified",
    emailVerifiedAt: 1,
    language: "en",
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: { localUri: "file://logo.png", updatedAt: 1, mimeType: "image/png" },
    pdfBranding: { ...DEFAULT_PDF_BRANDING },
    pinCode: "110092",
    pinDistrict: "East Delhi",
    pinState: "Delhi",
    pinLocality: "Patparganj",
    accountKind: "business",
    onboardingProfileVersion: 2,
    issuerIdentitySnapshotId: "snap1",
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

async function main() {
  // 1. Incomplete profile → Profile onboarding
  assert.equal(
    await resolveAuthOnboardingHref(baseUser()),
    "/(auth)/complete-profile"
  );

  // 2. Profile complete → You (null = boot continues to You)
  assert.equal(
    await resolveAuthOnboardingHref(baseUser({ profileCompletedAt: 1 })),
    null
  );

  // 3. Profile complete + missing ueidReleasedAt → You
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({ profileCompletedAt: 1, ueidReleasedAt: null })
    ),
    null
  );

  // 4. Profile complete + missing onboardingIntroSeenAt → You
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({ profileCompletedAt: 1, onboardingIntroSeenAt: null })
    ),
    null
  );

  // 5. Profile complete + missing locationConsentShownAt → You
  // (resolver no longer reads AsyncStorage footprint prefs)
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({
        profileCompletedAt: 1,
        ueidReleasedAt: null,
        onboardingIntroSeenAt: null,
      })
    ),
    null
  );

  // 6. Old all-complete user → You
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({
        profileCompletedAt: 1,
        ueidReleasedAt: 1,
        onboardingIntroSeenAt: 1,
      })
    ),
    null
  );

  // 7. Missing optional acknowledgement flags do not reopen onboarding
  const hrefMissingAcks = await resolveAuthOnboardingHref(
    baseUser({
      profileCompletedAt: 1,
      ueidReleasedAt: null,
      onboardingIntroSeenAt: null,
    })
  );
  assert.equal(hrefMissingAcks, null);
  assert.notEqual(hrefMissingAcks, "/(auth)/ueid");
  assert.notEqual(hrefMissingAcks, "/(auth)/onboarding-intro");
  assert.notEqual(hrefMissingAcks, "/(auth)/location-onboarding");

  // 8. Actual required identity failure (invalid UEID) still recovery route
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({ profileCompletedAt: 1, ueid: "" })
    ),
    "/(auth)/ueid"
  );
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({ profileCompletedAt: 1, ueid: "NOT-A-UEID" })
    ),
    "/(auth)/ueid"
  );

  // Cold-restart after profile persistence → You
  assert.equal(
    await resolveAuthOnboardingHref(
      baseUser({
        profileCompletedAt: Date.now(),
        ueidReleasedAt: null,
        onboardingIntroSeenAt: null,
      })
    ),
    null
  );

  console.log("resolveAuthOnboardingRoute.test.ts: ok");
}

void main();
