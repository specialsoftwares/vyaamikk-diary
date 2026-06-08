import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import {
  applyMockMobileChange,
  isPhoneReleasedInRegistry,
  markPhoneReleasedInRegistry,
} from "@/services/auth/identityRegistry/mockMobile";
import {
  assertNoStaleActiveAccountAtDerivedUid,
  findActiveProfileForLoginPhone,
  MOBILE_RELEASED_LOGIN_MESSAGE,
  resolveNewMockAccountUeid,
} from "@/services/auth/mobileIdentity";
import type { RegistryShape } from "@/services/auth/mockRegistry";
import { reconcileRegistryPhoneIndex } from "@/services/auth/mockRegistry";
import { deriveMockUidFromPhone, deriveUEIDFromPhone } from "@/utils/ueid";

const PHONE_A = "+919111111111";
const PHONE_B = "+919222222222";
const now = Date.now();

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  const uid = deriveMockUidFromPhone(PHONE_A);
  return {
    uid,
    ueid: deriveUEIDFromPhone(PHONE_A),
    phoneE164: PHONE_A,
    displayName: null,
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    language: null,
    profileCompletedAt: now,
    ueidReleasedAt: now,
    onboardingIntroSeenAt: now,
    profileLogo: null,
    pdfBranding: { includeProfileLogo: true },
    lastLoginAt: now,
    previousLoginAt: null,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    status: "active",
    mobileHash: null,
    ...overrides,
  };
}

function emptyRegistry(): RegistryShape {
  return { phoneIndex: {}, emailIndex: {}, seenPhones: {}, users: {}, releasedPhones: {} };
}

async function main() {
  // --- 1–4: register A → change to B → login B keeps X → login A must not get X ---
  const reg = emptyRegistry();
  const userA = baseProfile();
  const ueidX = userA.ueid;
  reg.users[userA.uid] = userA;
  reg.phoneIndex[PHONE_A] = userA.uid;

  const afterChange = await applyMockMobileChange(reg, userA, PHONE_B);
  assert.equal(afterChange.ueid, ueidX);
  assert.equal(afterChange.phoneE164, PHONE_B);
  assert.equal(reg.phoneIndex[PHONE_B], userA.uid);
  assert.equal(reg.phoneIndex[PHONE_A], undefined);
  assert.equal(isPhoneReleasedInRegistry(reg, PHONE_A), true);

  const loginB = findActiveProfileForLoginPhone(reg, PHONE_B);
  assert.ok(loginB);
  assert.equal(loginB.ueid, ueidX);

  const loginAIndexed = findActiveProfileForLoginPhone(reg, PHONE_A);
  assert.equal(loginAIndexed, null);

  let blockedStale = false;
  try {
    assertNoStaleActiveAccountAtDerivedUid(reg.users[userA.uid], PHONE_A);
  } catch (e) {
    blockedStale =
      e instanceof AppError && e.message === MOBILE_RELEASED_LOGIN_MESSAGE;
  }
  assert.equal(blockedStale, true);

  const freshUeidForA = resolveNewMockAccountUeid(reg, PHONE_A, true);
  assert.notEqual(freshUeidForA, ueidX);

  // Even if retired flag were false, releasedPhones tombstone must force fresh UEID.
  const freshDespiteFlag = resolveNewMockAccountUeid(reg, PHONE_A, false);
  assert.notEqual(freshDespiteFlag, ueidX);

  // --- 5: duplicate active mobile blocked ---
  const regDup = emptyRegistry();
  const owner = baseProfile({ uid: "mock_owner", phoneE164: PHONE_B, ueid: "VYD-2025-AAAAAA" });
  regDup.users[owner.uid] = owner;
  regDup.phoneIndex[PHONE_B] = owner.uid;
  assert.equal(findActiveProfileForLoginPhone(regDup, PHONE_B)?.uid, owner.uid);

  // --- Registry reload must not re-key uid from current phone (stable uid after change) ---
  const persisted: RegistryShape = {
    phoneIndex: { [PHONE_B]: userA.uid },
    releasedPhones: { [PHONE_A]: ueidX },
    emailIndex: {},
    seenPhones: { [PHONE_A]: true, [PHONE_B]: true },
    users: { [userA.uid]: afterChange },
  };
  reconcileRegistryPhoneIndex(persisted);
  assert.equal(persisted.users[userA.uid]?.uid, userA.uid);
  assert.equal(persisted.users[userA.uid]?.ueid, ueidX);
  assert.equal(persisted.phoneIndex[PHONE_A], undefined);
  assert.equal(persisted.phoneIndex[PHONE_B], userA.uid);
  assert.notEqual(resolveNewMockAccountUeid(persisted, PHONE_A, false), ueidX);

  markPhoneReleasedInRegistry(reg, "+919333333333", ueidX);
  assert.equal(isPhoneReleasedInRegistry(reg, "+919333333333"), true);

  console.log("identity.mobile.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
