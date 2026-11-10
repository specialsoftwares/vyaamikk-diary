/**
 * First profile save with age skipped.
 * Production patch builder -> profile seal/open -> save and read.
 * The profile writer is not mocked. No demographic band is stored, and the
 * account is not ageEligibility eligible.
 */

import assert from "node:assert/strict";

import type { UserProfile } from "@/domain/types";
import { ageEligibilityFromDemographicAnswer } from "@/onboarding/demographicAge";
import {
  buildClientProfileFirestoreWrite,
  stripServerOwnedProfilePatchKeys,
} from "@/services/auth/clientProfilePatchPayload";
import { applyProfilePatch, normaliseUserProfile } from "@/services/auth/normalizeProfile";
import { issueProfileDocumentIfOwned } from "@/services/auth/profileWriteOwnership";
import type { ProfilePatch } from "@/services/auth/types";
import { cloudPayloadLeaksPlaintext } from "@/services/privacy/diarySealDocument";
import {
  assertBusinessSealBinding,
  BUSINESS_SENSITIVE_FIELDS,
  sealedBusinessCloud,
  userProfileWriteNeedsSeal,
} from "@/services/privacy/businessCloudSeal";
import { assertBusinessAgeAdmitted } from "../../functions/src/identity/businessAdmission";
import {
  assertContentBinding,
  openContent,
  sealContent,
  type ContentSeal,
} from "../../functions/src/privacy/contentEncryption";

const CONTENT_KEY = Buffer.alloc(32, 11);
const OWNER = "uid-owner-a";
const FOREIGN = "uid-owner-b";
const PROFILE_COMPLETED_AT = 1_700_000_050_000;

function ownerProfile(uid: string): UserProfile {
  return {
    uid,
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
  };
}

function sensitiveProfile(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BUSINESS_SENSITIVE_FIELDS.users) {
    if (key in record) out[key] = record[key];
  }
  return out;
}

function isFailedPrecondition(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "failed-precondition"
  );
}

async function saveSkippedAgeProfile(input: {
  uid: string;
  liveUid: string;
  account: Record<string, unknown> | null;
  documents: Map<string, Record<string, unknown>>;
}): Promise<void> {
  await assertBusinessAgeAdmitted(input.uid, async () => input.account);
  const existing = ownerProfile(input.uid);
  assert.equal(existing.ageEligibility, undefined);
  assert.equal("demographicAgeBand" in existing, false);
  const patch: ProfilePatch = {
    displayName: "Ada Lovelace",
    businessName: "North Workshop",
    profileCompletedAt: PROFILE_COMPLETED_AT,
    accountKind: "business",
    pinCode: "110001",
    pinLocality: "Karol Bagh",
    pinDistrict: "New Delhi",
    pinState: "Delhi",
  };
  let payload: Record<string, unknown> | null = null;
  await issueProfileDocumentIfOwned({
    claim: { uid: input.uid, generation: 1 },
    readLive: () => ({ uid: input.liveUid, generation: 1 }),
    prepare: async () => {
      const safe = stripServerOwnedProfilePatchKeys(patch, { production: true });
      const next = applyProfilePatch(existing, safe);
      const write = buildClientProfileFirestoreWrite(existing, next, { production: true });
      if (!write) throw new Error("profile_writer_rejected");
      assert.equal(write.ageEligibility, undefined);
      assert.equal("demographicAgeBand" in write, false);
      assert.equal(ageEligibilityFromDemographicAnswer(null), null);
      assert.equal(ageEligibilityFromDemographicAnswer("skipped"), null);
      const needsSeal = userProfileWriteNeedsSeal(
        existing as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>
      );
      assert.equal(needsSeal, true);
      const revision = Number(write.updatedAt);
      assertContentBinding({ collection: "users", purpose: "profile", revision });
      const seal = sealContent({
        key: CONTENT_KEY,
        uid: input.uid,
        collection: "users",
        recordId: input.uid,
        revision,
        purpose: "profile",
        plaintext: Buffer.from(
          JSON.stringify(sensitiveProfile(next as unknown as Record<string, unknown>))
        ),
      });
      payload = sealedBusinessCloud({ collection: "users", plain: write, seal });
    },
    setDoc: async () => {
      if (!payload) throw new Error("missing_profile_payload");
      input.documents.set(input.uid, payload);
    },
  });
}

function readSavedProfile(saved: Record<string, unknown>, readerUid: string): Record<string, unknown> {
  const seal = saved.contentSeal as ContentSeal;
  assertBusinessSealBinding(
    "users",
    { uid: OWNER, updatedAt: Number(saved.updatedAt) },
    seal
  );
  const plaintext = JSON.parse(
    openContent({
      key: CONTENT_KEY,
      uid: readerUid,
      collection: "users",
      recordId: String(seal.recordId),
      revision: seal.revision,
      purpose: "profile",
      seal,
    }).toString()
  ) as Record<string, unknown>;
  const record: Record<string, unknown> = { ...saved };
  for (const key of BUSINESS_SENSITIVE_FIELDS.users) {
    if (key in plaintext) record[key] = plaintext[key];
  }
  return record;
}

async function main(): Promise<void> {
  const activeAccount = { status: "active" };
  assert.equal("ageEligibility" in activeAccount, false);
  assert.equal("demographicAgeBand" in activeAccount, false);

  const documents = new Map<string, Record<string, unknown>>();
  await saveSkippedAgeProfile({
    uid: OWNER,
    liveUid: OWNER,
    account: activeAccount,
    documents,
  });
  const saved = documents.get(OWNER);
  assert.ok(saved);
  assert.equal(saved.displayName, null);
  assert.equal(saved.pinCode, null);
  assert.equal(saved.profileCompletedAt, PROFILE_COMPLETED_AT);
  assert.equal("ageEligibility" in saved, false);
  assert.equal("demographicAgeBand" in saved, false);
  assert.equal(cloudPayloadLeaksPlaintext(saved, "Ada Lovelace"), false);
  assert.equal(cloudPayloadLeaksPlaintext(saved, "North Workshop"), false);
  assert.equal(cloudPayloadLeaksPlaintext(saved, "110001"), false);

  const record = readSavedProfile(saved, OWNER);
  assert.equal(record.displayName, "Ada Lovelace");
  assert.equal(record.businessName, "North Workshop");
  assert.equal(record.pinCode, "110001");
  assert.equal(record.profileCompletedAt, PROFILE_COMPLETED_AT);
  assert.notEqual(record.ageEligibility, "eligible");
  const normalised = normaliseUserProfile(OWNER, record);
  assert.equal(normalised.displayName, "Ada Lovelace");
  assert.equal(normalised.businessName, "North Workshop");
  assert.equal(normalised.profileCompletedAt, PROFILE_COMPLETED_AT);
  assert.equal(normalised.ageEligibility, undefined);
  assert.equal("demographicAgeBand" in normalised, false);

  assert.throws(
    () => readSavedProfile(saved, FOREIGN),
    (error: unknown) => error instanceof Error && error.message === "wrong_owner"
  );
  assert.throws(
    () =>
      assertBusinessSealBinding(
        "users",
        { uid: FOREIGN, updatedAt: Number(saved.updatedAt) },
        saved.contentSeal as ContentSeal
      ),
    /seal_binding_mismatch/
  );
  assert.equal(documents.get(OWNER)?.displayName, null);
  assert.equal(readSavedProfile(saved, OWNER).displayName, "Ada Lovelace");

  const missingDocs = new Map<string, Record<string, unknown>>();
  await assert.rejects(
    () =>
      saveSkippedAgeProfile({
        uid: "uid-missing",
        liveUid: "uid-missing",
        account: null,
        documents: missingDocs,
      }),
    isFailedPrecondition
  );
  assert.equal(missingDocs.size, 0);

  const inactiveDocs = new Map<string, Record<string, unknown>>();
  await assert.rejects(
    () =>
      saveSkippedAgeProfile({
        uid: "uid-inactive",
        liveUid: "uid-inactive",
        account: {
          status: "pending_deletion",
          ageEligibility: "eligible",
          demographicAgeBand: "18_24",
        },
        documents: inactiveDocs,
      }),
    isFailedPrecondition
  );
  assert.equal(inactiveDocs.size, 0);

  const foreignDocs = new Map<string, Record<string, unknown>>();
  await assert.rejects(
    () =>
      saveSkippedAgeProfile({
        uid: OWNER,
        liveUid: FOREIGN,
        account: { status: "active" },
        documents: foreignDocs,
      }),
    (error: unknown) => error instanceof Error && error.message === "session_changed"
  );
  assert.equal(foreignDocs.size, 0);

  console.log("profileFirstSave.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
