import assert from "node:assert/strict";

import {
  canVisitWizardStep,
  hrefForWizardStep,
  isPreDashboardOnboardingIncomplete,
  maxAuthorizedWizardStep,
  previousWizardStep,
  resumeWizardStep,
  sameEmailAddress,
  transformProfileDraftForAccountKind,
  wizardProgressLabel,
  wizardStepIndex,
  type OnboardingWizardStep,
} from "./onboardingWizard";
import type { UserProfile } from "@/domain/types";
import { DEFAULT_PDF_BRANDING } from "@/domain/types";

function baseUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VYD-2026-TEST01",
    phoneE164: "+919876543210",
    displayName: "T",
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

// Ordering + Back chain
assert.equal(previousWizardStep("mobileEntry"), null);
assert.equal(previousWizardStep("emailEntry"), "phoneOtp");
assert.equal(previousWizardStep("businessIdentity"), "emailOtp");
assert.equal(previousWizardStep("profileReview"), "businessIdentity");
assert.equal(previousWizardStep("ueidRelease"), "profileReview");

const progress = wizardProgressLabel("businessIdentity");
assert.equal(progress.current, 6);
assert.ok(progress.label.includes("6"));

// Max authorized / no forward skip
assert.equal(maxAuthorizedWizardStep(null), "mobileEntry");
assert.equal(maxAuthorizedWizardStep(baseUser()), "emailEntry");
assert.equal(
  maxAuthorizedWizardStep(
    baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verification_pending",
    })
  ),
  "emailOtp"
);
assert.equal(
  maxAuthorizedWizardStep(
    baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verified",
      emailVerifiedAt: 1,
    })
  ),
  "businessIdentity"
);

assert.equal(canVisitWizardStep("emailEntry", "businessIdentity"), true);
assert.equal(canVisitWizardStep("businessIdentity", "emailEntry"), false);
assert.equal(canVisitWizardStep("mobileEntry", "emailOtp"), true);

// Resume at most advanced incomplete
assert.equal(
  resumeWizardStep(
    baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verified",
      emailVerifiedAt: 1,
    })
  ),
  "businessIdentity"
);
assert.equal(
  resumeWizardStep(
    baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verified",
      emailVerifiedAt: 1,
      profileCompletedAt: 1,
    })
  ),
  "ueidRelease"
);

assert.equal(
  isPreDashboardOnboardingIncomplete(
    baseUser({
      businessEmail: "a@b.co",
      normalizedEmail: "a@b.co",
      emailStatus: "verified",
      emailVerifiedAt: 1,
      profileCompletedAt: 1,
      ueidReleasedAt: 1,
      onboardingIntroSeenAt: 1,
    }),
    { locationConsentShown: true }
  ),
  false
);

// Href mapping for review routes
const emailHref = hrefForWizardStep("emailEntry");
assert.ok(typeof emailHref === "object" || String(emailHref).includes("v2"));

// Unchanged email compare
assert.equal(sameEmailAddress("A@B.co", "a@b.co"), true);
assert.equal(sameEmailAddress("a@b.co", "c@d.co"), false);

// Profile type transform clears business fields
const transformed = transformProfileDraftForAccountKind(
  {
    accountKind: "business",
    displayName: "Ada",
    businessName: "Ada Co",
    workType: "Trade",
    designation: "Owner",
  },
  "individual"
);
assert.equal(transformed.clearedMeaningful, true);
assert.equal(transformed.draft.businessName, "");
assert.equal(transformed.draft.displayName, "Ada");
assert.equal(transformed.draft.accountKind, "individual");

// Step index monotonic for Back chain coverage
const chain: OnboardingWizardStep[] = [
  "locationFootprint",
  "onboardingIntro",
  "ueidRelease",
  "profileReview",
  "businessIdentity",
  "emailOtp",
  "emailEntry",
  "phoneOtp",
  "phoneConfirm",
  "mobileEntry",
];
for (let i = 0; i < chain.length - 1; i++) {
  assert.ok(wizardStepIndex(chain[i]!) > wizardStepIndex(chain[i + 1]!));
}

console.log("onboardingWizard.test.ts: ok");
