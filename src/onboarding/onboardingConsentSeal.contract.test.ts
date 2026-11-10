/**
 * Onboarding consent and demographic-age contracts.
 * Invokes production helpers with injected storage and profile IO.
 */
import assert from "node:assert/strict";

import {
  profileNeedsAgeGate,
  resolveSignedInOnboardingContinuation,
} from "@/domain/ageEligibility";
import type { LegalConsentRecord } from "@/domain/legalConsent";
import { normaliseUserProfile } from "@/services/auth/normalizeProfile";
import { updateProfileWithIo, type ProfileUpdateIo } from "@/services/auth/firebase";
import { randomBytes } from "node:crypto";
import { __setNativeSecureRandomForTests } from "@/services/accountDeletion/nativeSecureRandom";
import { parseDemographicAgeBand } from "@/onboarding/demographicAge";
import { persistDeferredPhoneConsent } from "@/services/consent/deferredConsentPersist";
import { clearPendingConsentIfUnchanged, loadPendingConsentValue, savePendingConsentValue } from "@/services/consent/pendingConsentKey";

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
  __setNativeSecureRandomForTests((length) => new Uint8Array(randomBytes(length)));
  const storage = memoryKv();
  const record: LegalConsentRecord = {
    consentVersion: "v1", termsVersion: "v1", privacyVersion: "v1", effectiveDate: "2026-01-01",
    acceptedAt: 1, sourceScreen: "auth_v2_phone_confirm", appVersion: "1", platform: "android",
  };
  const save = () => savePendingConsentValue(storage, JSON.stringify({ phoneE164: PHONE, record }));
  const load = () => loadPendingConsentValue(storage);
  const profile = verifiedEmailUser();
  const base = {
    profile, generationAtStart: 1, currentGeneration: () => 1,
    sessionUid: () => profile.uid, rebuildRecord: record, loadPending: load,
    clearIfUnchanged: (snapshot: Parameters<typeof clearPendingConsentIfUnchanged>[1], owns: () => boolean) => clearPendingConsentIfUnchanged(storage, snapshot, owns),
  };
  assert.equal(resolveSignedInOnboardingContinuation({ hasVerifiedEmail: false, profileCompletedAt: null, ageEligibility: "unassessed" }), "email");
  assert.equal(resolveSignedInOnboardingContinuation({ hasVerifiedEmail: true, profileCompletedAt: null, ageEligibility: "unassessed" }), "profile");
  assert.equal(resolveSignedInOnboardingContinuation({ hasVerifiedEmail: true, profileCompletedAt: 1, ageEligibility: "unassessed" }), "dashboard");
  assert.equal(profileNeedsAgeGate({ ageEligibility: "unassessed" }), false);
  assert.equal(parseDemographicAgeBand("prefer_not_to_say"), "prefer_not_to_say");
  assert.equal(parseDemographicAgeBand("18_24"), "18_24");
  assert.equal(parseDemographicAgeBand("2000-01-01"), null);

  await save();
  let failedWrites = 0;
  assert.equal(await persistDeferredPhoneConsent({ ...base, updateProfile: async () => { failedWrites++; throw new Error("write failed"); } }), "failed");
  assert.equal(failedWrites, 1);
  assert.ok(await load(), "failed consent write keeps retry copy");
  const merged: Record<string, unknown>[] = [], opens: unknown[] = [], seals: unknown[] = [];
  assert.equal(await persistDeferredPhoneConsent({ ...base, updateProfile: (patch) => updateProfileWithIo(profile.uid, patch, profileIo({ raw: { ...profile, legalConsents: [] }, readAuthUid: () => profile.uid, merged, opens, seals })) }), "written");
  assert.equal(merged.length, 1);
  assert.ok(Array.isArray(merged[0].legalConsents));
  assert.equal(merged[0].ageEligibility, undefined);
  assert.equal(merged[0].displayName, undefined);
  assert.equal(opens.length, 0);
  assert.equal(seals.length, 0);
  assert.equal(await load(), null);

  await updateProfileWithIo(profile.uid, { displayName: "Ada Lovelace", legalConsents: [record] }, profileIo({ raw: { ...profile, legalConsents: [] }, readAuthUid: () => profile.uid, merged, opens, seals }));
  assert.equal(opens.length, 1);
  assert.equal(seals.length, 1);
  assert.equal((merged[1].contentSeal as { sealed: boolean }).sealed, true);

  await save();
  let signedIn = true;
  const refused: Record<string, unknown>[] = [];
  const result = await persistDeferredPhoneConsent({ ...base, sessionUid: () => signedIn ? profile.uid : null,
    updateProfile: (patch) => updateProfileWithIo(profile.uid, patch, profileIo({ raw: { ...profile, legalConsents: [] }, readAuthUid: () => signedIn ? profile.uid : null, onRead: () => { signedIn = false; }, merged: refused, opens: [], seals: [] })),
  });
  assert.equal(result, "failed");
  assert.equal(refused.length, 0);
  assert.ok(await load(), "session replacement keeps pending consent");

  let epoch = 1;
  assert.equal(await persistDeferredPhoneConsent({ ...base, currentGeneration: () => epoch, updateProfile: async () => { epoch = 2; } }), "skipped");
  assert.ok(await load(), "late write acknowledgement cannot clear after same-UID session replacement");
  let currentUid: string | null = profile.uid;
  let retiredWrites = 0;
  assert.equal(await persistDeferredPhoneConsent({ ...base, sessionUid: () => currentUid,
    loadPending: async () => { const pending = await load(); currentUid = null; return pending; },
    updateProfile: async () => { retiredWrites++; },
  }), "skipped");
  assert.equal(retiredWrites, 0, "sign-out during storage read cannot dispatch profile write");
  console.log("onboardingConsentSeal.contract.test.ts: ok");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
