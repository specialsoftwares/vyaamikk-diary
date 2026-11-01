/**
 * Onboarding consent and demographic-age contracts.
 * Invokes production helpers with injected storage and profile IO.
 */
import assert from "node:assert/strict";

import {
  parseDemographicAgeRange,
  profileNeedsAgeGate,
  resolveSignedInOnboardingContinuation,
} from "@/domain/ageEligibility";
import { AppError } from "@/domain/errors";
import type { LegalConsentRecord } from "@/domain/legalConsent";
import { normaliseUserProfile } from "@/services/auth/normalizeProfile";
import { updateProfileWithIo, type ProfileUpdateIo } from "@/services/auth/firebase";
import {
  __setLegalConsentStorageForTests,
  acknowledgePendingConsentPersisted,
  applyConsentPatchAfterPhoneVerify,
  consentPatchForProfile,
  loadPendingConsent,
  savePendingConsent,
  serializePendingConsentSave,
} from "@/services/consent/legalConsentService";

const PHONE = "+919876543210";

function memoryKv() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: async (key: string) => {
      map.delete(key);
    },
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return normaliseUserProfile("uid-1", {
    uid: "uid-1",
    ueid: "VYD-2026-TEST01",
    phoneE164: PHONE,
    createdAt: 1,
    updatedAt: 1,
    ageEligibility: "unassessed",
    legalConsents: [],
    profileCompletedAt: null,
    ...overrides,
  });
}

function verifiedEmailUser() {
  return user({
    businessEmail: "ada@example.com",
    normalizedEmail: "ada@example.com",
    emailStatus: "verified",
    emailVerifiedAt: 10,
    profileCompletedAt: null,
    ageEligibility: "unassessed",
  });
}

function profileIo(input: {
  raw: Record<string, unknown>;
  readAuthUid: () => string | null;
  onRead?: () => void;
  merged: Record<string, unknown>[];
  opens: unknown[];
  seals: unknown[];
}): ProfileUpdateIo {
  return {
    production: true,
    readAuthUid: input.readAuthUid,
    requireJsAuthSession: async () => undefined,
    getUserDoc: async () => {
      input.onRead?.();
      return { exists: true, data: input.raw };
    },
    mergeUserDoc: async (_uid, data) => {
      input.merged.push(data);
    },
    openBusinessCloud: async (_collection, record) => {
      input.opens.push(record);
      return record;
    },
    protectBusinessCloud: async (sealInput) => {
      input.seals.push(sealInput);
      return { ...sealInput.plain, contentSeal: { sealed: true } };
    },
  };
}

async function main() {
  __setLegalConsentStorageForTests(memoryKv());

  const afterPhoneAndEmail = resolveSignedInOnboardingContinuation({
    hasVerifiedEmail: true,
    profileCompletedAt: null,
    ageEligibility: "unassessed",
    demographicAgeRange: null,
  });
  assert.equal(afterPhoneAndEmail, "profile");
  assert.notEqual(String(afterPhoneAndEmail), "age-declaration");

  const afterPhoneOnly = resolveSignedInOnboardingContinuation({
    hasVerifiedEmail: false,
    profileCompletedAt: null,
    ageEligibility: "unassessed",
    demographicAgeRange: "prefer_not_to_say",
  });
  assert.equal(afterPhoneOnly, "email");

  assert.equal(
    profileNeedsAgeGate({ ageEligibility: "unassessed", demographicAgeRange: null }),
    false
  );
  assert.equal(profileNeedsAgeGate({ ageEligibility: null }), false);
  assert.equal(profileNeedsAgeGate(undefined), false);
  assert.equal(
    resolveSignedInOnboardingContinuation({
      hasVerifiedEmail: true,
      profileCompletedAt: 50,
      ageEligibility: "unassessed",
      demographicAgeRange: null,
    }),
    "dashboard"
  );
  assert.equal(parseDemographicAgeRange("prefer_not_to_say"), "prefer_not_to_say");
  assert.equal(parseDemographicAgeRange("18_24"), "18_24");
  assert.equal(parseDemographicAgeRange("2000-01-01"), null);

  const [older, newer] = await Promise.all([
    serializePendingConsentSave(PHONE, "older-choice"),
    serializePendingConsentSave(PHONE, "newer-choice"),
  ]);
  assert.notEqual(older, newer);
  const stale = Math.min(older, newer);
  const current = Math.max(older, newer);
  assert.equal(await acknowledgePendingConsentPersisted(stale), false);
  assert.ok(await loadPendingConsent());
  assert.equal(await acknowledgePendingConsentPersisted(current), true);
  assert.equal(await loadPendingConsent(), null);

  const profile = verifiedEmailUser();
  await savePendingConsent(PHONE, "auth_v2_phone_confirm");
  const prepared = await consentPatchForProfile(profile);
  assert.ok(prepared);
  assert.ok(prepared.patch.legalConsents?.length);
  assert.equal(prepared.patch.displayName, undefined);

  let failedWrites = 0;
  await assert.rejects(
    () =>
      applyConsentPatchAfterPhoneVerify({
        profile,
        initiatingUid: profile.uid,
        readCurrentUid: () => profile.uid,
        startOtp: async () => {
          throw new Error("startOtp must not run");
        },
        writeProfile: async () => {
          failedWrites += 1;
          throw new Error("consent write failed");
        },
      }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      return true;
    }
  );
  assert.equal(failedWrites, 1);
  assert.ok(await loadPendingConsent(), "failed consent write keeps the retry copy");

  const merged: Record<string, unknown>[] = [];
  const opens: unknown[] = [];
  const seals: unknown[] = [];
  let otpStarts = 0;
  const continued = await applyConsentPatchAfterPhoneVerify({
    profile,
    initiatingUid: profile.uid,
    readCurrentUid: () => profile.uid,
    startOtp: async () => {
      otpStarts += 1;
    },
    writeProfile: (patch) =>
      updateProfileWithIo(
        profile.uid,
        patch,
        profileIo({
          raw: { ...profile, legalConsents: [] },
          readAuthUid: () => profile.uid,
          merged,
          opens,
          seals,
        })
      ),
  });
  assert.equal(otpStarts, 0);
  assert.equal(continued.destination, "profile");
  assert.equal(opens.length, 0);
  assert.equal(seals.length, 0);
  assert.equal(merged.length, 1);
  assert.ok(Array.isArray(merged[0]?.legalConsents));
  assert.equal(Object.prototype.hasOwnProperty.call(merged[0], "displayName"), false);
  assert.equal(merged[0]?.ageEligibility, undefined);
  assert.equal(await loadPendingConsent(), null);

  const sensitiveMerged: Record<string, unknown>[] = [];
  const sensitiveOpens: unknown[] = [];
  const sensitiveSeals: unknown[] = [];
  const consentRecord = prepared.patch.legalConsents?.[0] as LegalConsentRecord;
  await updateProfileWithIo(
    profile.uid,
    { displayName: "Ada Lovelace", legalConsents: [consentRecord] },
    profileIo({
      raw: { ...profile, legalConsents: [] },
      readAuthUid: () => profile.uid,
      merged: sensitiveMerged,
      opens: sensitiveOpens,
      seals: sensitiveSeals,
    })
  );
  assert.equal(sensitiveOpens.length, 1);
  assert.equal(sensitiveSeals.length, 1);
  assert.equal(sensitiveMerged.length, 1);
  assert.equal(
    (sensitiveMerged[0]?.contentSeal as { sealed?: boolean } | undefined)?.sealed,
    true
  );

  await savePendingConsent(PHONE, "auth_v2_phone_confirm");
  let signedIn = true;
  const refusedMerges: Record<string, unknown>[] = [];
  let published: string | null = "not-run";
  await assert.rejects(
    () =>
      applyConsentPatchAfterPhoneVerify({
        profile,
        initiatingUid: profile.uid,
        readCurrentUid: () => (signedIn ? profile.uid : null),
        startOtp: async () => {
          otpStarts += 1;
        },
        writeProfile: async (patch) => {
          const next = await updateProfileWithIo(
            profile.uid,
            patch,
            profileIo({
              raw: { ...profile, legalConsents: [] },
              readAuthUid: () => (signedIn ? profile.uid : null),
              onRead: () => {
                signedIn = false;
              },
              merged: refusedMerges,
              opens: [],
              seals: [],
            })
          );
          published = "wrote";
          return next;
        },
      }).then((result) => {
        published = result.destination;
        return result;
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "permission_denied");
      assert.equal(error.message, "session_changed");
      return true;
    }
  );
  assert.equal(refusedMerges.length, 0);
  assert.equal(published, "not-run");
  assert.equal(otpStarts, 0);
  assert.ok(await loadPendingConsent(), "uid mismatch keeps the pending consent copy");

  console.log("onboardingConsentSeal.contract.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
