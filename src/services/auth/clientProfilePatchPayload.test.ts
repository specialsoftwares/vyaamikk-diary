import assert from "node:assert/strict";

import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";
import {
  buildClientProfileFirestoreWrite,
  findRejectedProductionPatchKeys,
  legacyProfileDocumentMergeFields,
  stripServerOwnedProfilePatchKeys,
} from "@/services/auth/clientProfilePatchPayload";
import { hashEmail } from "@/utils/emailHash";

function baseUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "user-a",
    ueid: "VYD-2026-AAAAAA",
    phoneE164: "+919876543210",
    displayName: "Ada",
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    language: null,
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { ...DEFAULT_PDF_BRANDING },
    lastLoginAt: 1,
    previousLoginAt: null,
    lastActiveAt: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    deletedAt: null,
    status: "active",
    ...overrides,
  };
}

// strip server-owned keys from patch
const stripped = stripServerOwnedProfilePatchKeys(
  {
    displayName: "New",
    emailHash: "abc",
    emailVerifiedAt: 99,
    businessEmail: "a@b.com",
    status: "deleted",
  },
  { production: true }
);
assert.equal(stripped.displayName, "New");
assert.equal(stripped.emailHash, undefined);
assert.equal(stripped.emailVerifiedAt, undefined);
assert.equal(stripped.businessEmail, undefined);
assert.equal(stripped.status, undefined);

// reject list includes email identity keys
const rejected = findRejectedProductionPatchKeys({
  businessEmail: "a@b.com",
  emailHash: "deadbeef",
});
assert.ok(rejected.includes("emailHash"));
assert.ok(rejected.includes("businessEmail"));

// safe last-active write — only changed keys
const existing = baseUser({ lastActiveAt: 100, updatedAt: 100 });
const next = baseUser({ lastActiveAt: 200, updatedAt: 200 });
const touchWrite = buildClientProfileFirestoreWrite(existing, next, { production: true });
assert.deepEqual(touchWrite, { lastActiveAt: 200, updatedAt: 200 });

// onboarding identity without email
const onboardExisting = baseUser();
const onboardNext = baseUser({
  displayName: "Ada Lovelace",
  profileCompletedAt: 2_000,
  updatedAt: 2_000,
});
const onboardWrite = buildClientProfileFirestoreWrite(onboardExisting, onboardNext, {
  production: true,
});
assert.equal(onboardWrite?.displayName, "Ada Lovelace");
assert.equal(onboardWrite?.profileCompletedAt, 2_000);
assert.equal("emailHash" in (onboardWrite ?? {}), false);
assert.equal("status" in (onboardWrite ?? {}), false);

// legacy full merge would include protected fields
const legacy = legacyProfileDocumentMergeFields(
  baseUser({
    businessEmail: "a@b.com",
    normalizedEmail: "a@b.com",
    emailHash: hashEmail("a@b.com"),
    emailVerifiedAt: null,
  })
);
assert.ok("emailHash" in legacy);
assert.ok("status" in legacy);

// production write skips email fields even when changed in memory
const emailExisting = baseUser();
const emailNext = baseUser({
  businessEmail: "a@b.com",
  normalizedEmail: "a@b.com",
  emailHash: hashEmail("a@b.com"),
  emailStatus: "verified",
  emailLinkedAt: 9,
  emailVerifiedAt: 9,
  updatedAt: 9,
});
const emailWrite = buildClientProfileFirestoreWrite(emailExisting, emailNext, {
  production: true,
});
assert.equal(emailWrite, null);

// consent patch
const consentExisting = baseUser({ legalConsents: [] });
const consentNext = baseUser({
  legalConsents: [
    {
      consentVersion: "2026-01",
      termsVersion: "2026-01",
      privacyVersion: "2026-01",
      effectiveDate: "2026-01-01",
      acceptedAt: 3,
      sourceScreen: "auth",
      appVersion: "1.0.0",
      platform: "ios",
    },
  ],
  updatedAt: 3,
});
const consentWrite = buildClientProfileFirestoreWrite(consentExisting, consentNext, {
  production: true,
});
assert.ok(Array.isArray(consentWrite?.legalConsents));
assert.equal((consentWrite?.legalConsents as unknown[]).length, 1);

// legacy profile without status — safe edit does not materialize status
const legacyExisting = baseUser({ status: undefined as unknown as "active" });
delete (legacyExisting as { status?: string }).status;
const legacyNext = baseUser({ displayName: "Legacy User", updatedAt: 4 });
const legacyWrite = buildClientProfileFirestoreWrite(legacyExisting, legacyNext, {
  production: true,
});
assert.equal(legacyWrite?.displayName, "Legacy User");
assert.equal("status" in (legacyWrite ?? {}), false);

console.log("clientProfilePatchPayload.test.ts: all assertions passed");
