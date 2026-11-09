/**
 * Skipped demographic age is not eligibility, profile completion does not
 * require a band, and active-account admission does not reject a missing band.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ageEligibilityFromDemographicAnswer as serverAnswer } from "../../functions/src/identity/ageEligibility";
import { assertBusinessAgeAdmitted, decideBusinessAge } from "../../functions/src/identity/businessAdmission";
import type { UserProfile } from "@/domain/types";
import {
  DEMOGRAPHIC_AGE_BANDS,
  DEMOGRAPHIC_AGE_SKIPPED,
  ageEligibilityFromDemographicAnswer,
  demographicAgeStorageKey,
  demographicAnswerAllowsProfileCompletion,
  profileCompletionRequiresDemographicAge,
  readDeviceDemographicAge,
  writeDeviceDemographicAge,
  type DemographicAgeDeviceStore,
  type DemographicAgeSelection,
} from "@/onboarding/demographicAge";
import { DEMOGRAPHIC_AGE_COPY, demographicAgeCopy } from "@/onboarding/demographicAgeCopy";
import {
  __resetCompleteOnboardingFlightForTests,
  completeOnboardingProfileWithDeps,
} from "@/onboarding/completeOnboardingProfileLogic";
import {
  isIdentityDetailsContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import {
  buildClientProfileFirestoreWrite,
  findRejectedProductionPatchKeys,
  stripServerOwnedProfilePatchKeys,
} from "@/services/auth/clientProfilePatchPayload";
import {
  ageEligibilityFromDemographicProfile,
  normaliseUserProfile,
} from "@/services/auth/normalizeProfile";
import type { ProfilePatch } from "@/services/auth/types";

const REMOVED_AGE_CONJUNCT = "ageEligibility', '') == 'eligible'";

function memoryStore(): DemographicAgeDeviceStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "user-a",
    ueid: "VYD-TEST",
    phoneE164: "+10000000000",
    displayName: "Ada",
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: "a@example.test",
    normalizedEmail: "a@example.test",
    emailStatus: "verified",
    emailVerifiedAt: 1,
    language: "en",
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { includeProfileLogo: false },
    lastLoginAt: 1,
    previousLoginAt: null,
    lastActiveAt: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    status: "active",
    ...over,
  };
}

function draft(): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid: "user-a",
    environment: "local-mock",
    accountKind: "business",
    displayName: "Ada",
    businessName: "North Workshop",
    constitution: "Proprietorship",
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
    profileLogo: null,
    logoPreviewUri: null,
    logoPersisted: false,
    updatedAt: 1,
  };
}

function assertFirestoreHelper(source: string, label: string) {
  assert.equal(source.includes(REMOVED_AGE_CONJUNCT), false, label);
  const start = source.indexOf("function isActiveUser(uid)");
  assert.ok(start >= 0, label);
  const body = source.slice(start, source.indexOf("function identityLockedFieldsUnchanged", start));
  assert.match(body, /isOwner\(uid\)/);
  assert.match(body, /userStatus\(uid\) == 'active'/);
  assert.match(body, /deletionJobAllowsActivity\(uid\)/);
  assert.doesNotMatch(body, /ageEligibility/);
  assert.match(
    source,
    /request\.resource\.data\.get\('ageEligibility', ''\) == resource\.data\.get\('ageEligibility', ''\)/
  );
}

function assertStorageHelper(source: string, label: string) {
  assert.equal(source.includes(REMOVED_AGE_CONJUNCT), false, label);
  const start = source.indexOf("function ageEligible(userId)");
  assert.ok(start >= 0, label);
  const body = source.slice(start, source.indexOf("function deletionAllowsStorage", start));
  assert.match(body, /firestore\.exists\(userPath\)/);
  assert.match(body, /status', 'active'\) == 'active'/);
  assert.doesNotMatch(body, /ageEligibility/);
  assert.match(
    source,
    /return isOwner\(userId\) && ageEligible\(userId\) && deletionAllowsStorage\(userId\);/
  );
  assert.match(source, /match \/users\/\{userId\}\/attachments\/\{recordId\}\/\{fileName\}/);
  assert.equal(source.includes("generationBind"), false, label);
}

async function main() {
  const moduleSource = readFileSync(resolve("src/onboarding/demographicAge.ts"), "utf8");
  assert.match(moduleSource, /not uploaded/);
  const retiredRoute = readFileSync(resolve("app/(auth)/age-declaration.tsx"), "utf8");
  assert.equal(retiredRoute.includes("AgeDeclarationScreen"), false);
  assert.equal(retiredRoute.includes("callRecordAgeAssessment"), false);
  assert.match(retiredRoute, /complete-profile/);

  const answers: Array<DemographicAgeSelection | null | undefined> = [
    null,
    undefined,
    DEMOGRAPHIC_AGE_SKIPPED,
    ...DEMOGRAPHIC_AGE_BANDS,
  ];
  for (const answer of answers) {
    assert.equal(ageEligibilityFromDemographicAnswer(answer), null);
    assert.notEqual(ageEligibilityFromDemographicAnswer(answer), "eligible");
    assert.equal(serverAnswer(answer), null);
    assert.equal(demographicAnswerAllowsProfileCompletion(answer), true);
  }
  assert.equal(profileCompletionRequiresDemographicAge(), false);
  assert.equal(ageEligibilityFromDemographicProfile({ demographicAgeBand: "skipped" }), null);
  assert.equal(ageEligibilityFromDemographicProfile({ demographicAgeBand: "under_18" }), null);
  assert.equal(ageEligibilityFromDemographicProfile({ ageEligibility: "eligible" }), null);

  const stored = normaliseUserProfile("user-a", {
    uid: "user-a",
    demographicAgeBand: "skipped",
    createdAt: 1,
    updatedAt: 1,
  });
  assert.notEqual(stored.ageEligibility, "eligible");
  assert.equal(stored.ageEligibility, undefined);

  const preferNot = normaliseUserProfile("user-a", {
    uid: "user-a",
    demographicAgeBand: "prefer_not_to_say",
    createdAt: 1,
    updatedAt: 1,
  });
  assert.notEqual(preferNot.ageEligibility, "eligible");

  const store = memoryStore();
  await writeDeviceDemographicAge("user-a", DEMOGRAPHIC_AGE_SKIPPED, store);
  assert.equal(store.data.get(demographicAgeStorageKey("user-a")), "skipped");
  assert.equal(await readDeviceDemographicAge("user-a", store), "skipped");
  assert.equal(ageEligibilityFromDemographicAnswer(await readDeviceDemographicAge("user-a", store)), null);
  await writeDeviceDemographicAge("user-a", "prefer_not_to_say", store);
  assert.equal(await readDeviceDemographicAge("user-a", store), "prefer_not_to_say");
  assert.notEqual(store.data.get(demographicAgeStorageKey("user-a")), "eligible");

  assert.equal(demographicAgeCopy("hi"), DEMOGRAPHIC_AGE_COPY.hi);
  assert.equal(demographicAgeCopy("en").skip, "Skip");
  assert.equal(demographicAgeCopy("hi").skip, "छोड़ें");
  assert.equal(demographicAgeCopy("ta").title, DEMOGRAPHIC_AGE_COPY.en.title);
  for (const band of DEMOGRAPHIC_AGE_BANDS) {
    assert.ok(DEMOGRAPHIC_AGE_COPY.en.bands[band].length > 0);
    assert.ok(DEMOGRAPHIC_AGE_COPY.hi.bands[band].length > 0);
  }

  const validation = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+10000000000",
    email: "a@example.test",
    draft: draft(),
  });
  assert.equal(validation.ok, true);
  assert.equal(
    isIdentityDetailsContinueEnabled({
      displayName: "Ada",
      accountKind: "business",
      businessName: "North Workshop",
      constitution: "Proprietorship",
    }),
    true
  );

  __resetCompleteOnboardingFlightForTests();
  const captured: { patch: ProfilePatch | null } = { patch: null };
  await completeOnboardingProfileWithDeps({
    user: profile(),
    draft: draft(),
    updateProfile: async (patch) => {
      captured.patch = patch;
      return profile({ profileCompletedAt: patch.profileCompletedAt ?? 1 });
    },
    persistSnapshot: async () => undefined,
    assertDurableLogo: async () => undefined,
    clearDraft: async () => undefined,
    now: 50,
  });
  assert.ok(captured.patch);
  assert.equal(typeof captured.patch.profileCompletedAt, "number");
  assert.equal("ageEligibility" in captured.patch, false);
  assert.equal("demographicAgeBand" in captured.patch, false);

  const bandOnly = {
    displayName: "Ada",
    demographicAgeBand: "under_18",
    demographicAgeRange: "18_24",
  } as ProfilePatch;
  assert.deepEqual(findRejectedProductionPatchKeys(bandOnly), []);
  const stripped = stripServerOwnedProfilePatchKeys(bandOnly, { production: true });
  assert.equal(stripped.displayName, "Ada");
  assert.equal("demographicAgeBand" in stripped, false);
  assert.equal("demographicAgeRange" in stripped, false);
  assert.equal("ageEligibility" in stripped, false);

  const forged = { displayName: "Ada", ageEligibility: "eligible" } as ProfilePatch;
  assert.ok(findRejectedProductionPatchKeys(forged).includes("ageEligibility"));
  assert.equal("ageEligibility" in stripServerOwnedProfilePatchKeys(forged), false);

  const existing = profile();
  const eligibilityOnly = profile({ ageEligibility: "eligible" });
  assert.equal(buildClientProfileFirestoreWrite(existing, eligibilityOnly, { production: true }), null);
  const named = profile({ displayName: "Ada Lovelace", updatedAt: 2, ageEligibility: "eligible" });
  const write = buildClientProfileFirestoreWrite(existing, named, { production: true });
  assert.equal(write?.displayName, "Ada Lovelace");
  assert.equal(write?.ageEligibility, undefined);
  assert.equal(write != null && "demographicAgeBand" in write, false);

  assert.equal(decideBusinessAge(null), "missing");
  assert.equal(decideBusinessAge({ status: "active" }), "active");
  assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "skipped" }), "active");
  assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "prefer_not_to_say" }), "active");
  assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "under_18" }), "active");
  assert.equal(
    decideBusinessAge({ status: "active", ageEligibility: "ineligible", demographicAgeBand: "18_24" }),
    "active"
  );
  assert.equal(
    decideBusinessAge({ status: "active", ageEligibility: "eligible", demographicAgeBand: "under_18" }),
    decideBusinessAge({ status: "active" })
  );
  assert.notEqual(decideBusinessAge({ status: "active", demographicAgeBand: "55_plus" }), "eligible");
  assert.equal(decideBusinessAge({ status: "pending_deletion", demographicAgeBand: "skipped" }), "inactive");

  await assertBusinessAgeAdmitted("owner", async () => ({ status: "active" }));
  await assertBusinessAgeAdmitted("owner", async () => ({ status: "active", demographicAgeBand: "skipped" }));
  await assertBusinessAgeAdmitted("owner", async () => ({
    status: "active",
    ageEligibility: "unassessed",
  }));
  const failedPrecondition = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "failed-precondition";
  await assert.rejects(
    () => assertBusinessAgeAdmitted("gone", async () => null),
    failedPrecondition
  );
  await assert.rejects(
    () =>
      assertBusinessAgeAdmitted("pending", async () => ({
        status: "pending_deletion",
        ageEligibility: "eligible",
        demographicAgeBand: "prefer_not_to_say",
      })),
    failedPrecondition
  );

  for (const file of ["firestore.rules", "rules/activated/firestore.rules"]) {
    assertFirestoreHelper(readFileSync(resolve(file), "utf8"), file);
  }
  for (const file of ["storage.rules", "rules/activated/storage.rules"]) {
    assertStorageHelper(readFileSync(resolve(file), "utf8"), file);
  }

  const grin = readFileSync(resolve("functions/src/goodsEvidence/productionExports.ts"), "utf8");
  assert.match(grin, /assertBusinessAgeAdmitted/);
  assert.doesNotMatch(grin, /ageEligibility/);
  const seal = readFileSync(resolve("functions/src/privacy/ownerContent.ts"), "utf8");
  assert.match(seal, /assertAdmittedCallableUser/);
  assert.match(seal, /assertBusinessAgeAdmitted/);
  assert.match(seal, /assertRestoreTrafficClosed/);

  console.log("demographicAge.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
