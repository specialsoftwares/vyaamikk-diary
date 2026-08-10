/**
 * Atomic complete-profile single-flight + validation (pure deps, no native FS).
 */

import assert from "node:assert/strict";

import {
  __resetCompleteOnboardingFlightForTests,
  completeOnboardingProfileWithDeps,
} from "./completeOnboardingProfileLogic";
import type { OnboardingProfileDraftV2 } from "./profileIdentityModel";
import type { UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import { AppError } from "@/domain/errors";

function draft(over: Partial<OnboardingProfileDraftV2> = {}): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid: "u1",
    environment: "local-mock",
    accountKind: "individual",
    displayName: "Ada",
    businessName: "",
    constitution: "",
    gstin: "",
    gstinVerificationState: "notProvided",
    pinCode: "110001",
    pinLocalityChoices: [],
    selectedLocality: "A",
    confirmedLocation: {
      pinCode: "110001",
      locality: "A",
      district: "New Delhi",
      state: "Delhi",
      country: "India",
      confirmedAt: 1,
      source: "offline",
    },
    profileLogo: {
      localUri: "file:///logo.jpg",
      mimeType: "image/jpeg",
      updatedAt: 1,
    },
    logoPreviewUri: null,
    logoPersisted: true,
    updatedAt: 1,
    ...over,
  };
}

function user(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VD",
    phoneE164: "+919876543210",
    displayName: null,
    salutation: null,
    businessName: null,
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
    profileLogo: null,
    pdfBranding: { includeProfileLogo: true },
    lastLoginAt: null,
    previousLoginAt: null,
    lastActiveAt: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...over,
  };
}

async function main() {
  __resetCompleteOnboardingFlightForTests();

  let updateCalls = 0;
  let snapshotCalls = 0;
  const deps = {
    persistSnapshot: async () => {
      snapshotCalls += 1;
    },
    assertDurableLogo: async () => undefined,
    clearDraft: async () => undefined,
  };

  const p1 = completeOnboardingProfileWithDeps({
    user: user(),
    draft: draft(),
    updateProfile: async (patch) => {
      updateCalls += 1;
      assert.equal(typeof patch.profileCompletedAt, "number");
      assert.equal(patch.onboardingProfileVersion, 2);
      return user({ profileCompletedAt: patch.profileCompletedAt ?? 1 });
    },
    ...deps,
    now: 100,
  });
  const p2 = completeOnboardingProfileWithDeps({
    user: user(),
    draft: draft(),
    updateProfile: async (patch) => {
      updateCalls += 1;
      return user({ profileCompletedAt: patch.profileCompletedAt ?? 1 });
    },
    ...deps,
    now: 100,
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.snapshot.snapshotId, r2.snapshot.snapshotId);
  assert.equal(updateCalls, 1);
  assert.equal(snapshotCalls, 1);

  __resetCompleteOnboardingFlightForTests();
  await assert.rejects(
    () =>
      completeOnboardingProfileWithDeps({
        user: user({ emailStatus: "unverified", emailVerifiedAt: null }),
        draft: draft(),
        updateProfile: async () => user(),
        ...deps,
      }),
    (e: unknown) => e instanceof AppError
  );

  __resetCompleteOnboardingFlightForTests();
  let rolledBack = false;
  await assert.rejects(
    () =>
      completeOnboardingProfileWithDeps({
        user: user(),
        draft: draft(),
        updateProfile: async () => {
          throw new Error("write failed");
        },
        persistSnapshot: async () => {
          snapshotCalls += 1;
        },
        assertDurableLogo: async () => undefined,
        clearDraft: async () => {
          rolledBack = true;
        },
      }),
    (e: unknown) => e instanceof AppError && e.code === "save_failed"
  );
  assert.equal(rolledBack, false); // draft retained on failure

  __resetCompleteOnboardingFlightForTests();
  let professionalPatch: ProfilePatch | undefined;
  await completeOnboardingProfileWithDeps({
    user: user(),
    draft: draft({
      accountKind: "business",
      displayName: "Shivam Saurav",
      businessName: "",
      constitution: "Individual Professional / Sole Practice",
    }),
    updateProfile: async (patch) => {
      professionalPatch = patch;
      return user({ profileCompletedAt: patch.profileCompletedAt ?? 1 });
    },
    persistSnapshot: async () => undefined,
    assertDurableLogo: async () => undefined,
    clearDraft: async () => undefined,
    now: 200,
  });
  assert.ok(professionalPatch);
  assert.equal(professionalPatch.accountKind, "business");
  assert.equal(professionalPatch.workType, "Individual Professional / Sole Practice");
  assert.equal(professionalPatch.businessName, "Shivam Saurav");
  assert.notEqual(professionalPatch.accountKind, "individual");

  console.log("completeOnboardingProfile.test.ts: ok");
}

void main();
