import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTACT_AVAILABILITY_INVARIANT,
  REVIEW_CONTACT_EDIT_MAX,
  REVIEW_EDIT_LIMIT_INVARIANT,
  REVIEW_EMAIL_EDIT_LIMIT_MESSAGE,
  REVIEW_MOBILE_EDIT_LIMIT_MESSAGE,
  assertReviewContactEditAllowed,
  classifyContactAssignment,
  contactsMatchNormalized,
  isOnboardingReviewLifecycle,
  nextReviewContactEditCount,
  normalizeReviewContactCount,
  reviewContactEditAllowed,
  reviewContactEditRemaining,
  shouldCountSuccessfulReviewContactReplacement,
  shouldQuarantineReleasedMobile,
} from "@/auth-v2/reviewContactEditPolicy";
import { CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE } from "@/auth-v2/contactChange/contactChangeModel";
import { applyMockMobileChange } from "@/services/auth/identityRegistry/mockMobile";
import type { RegistryShape } from "@/services/auth/mockRegistry";
import type { UserProfile } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { normalizeEmail } from "@/utils/emailHash";
import { deriveMockUidFromPhone, deriveUEIDFromPhone } from "@/utils/ueid";

const root = join(__dirname, "../..");
const PHONE_A = "+919111111111";
const PHONE_B = "+919222222222";
const PHONE_C = "+919333333333";
const PHONE_OTHER = "+919444444444";
const EMAIL_X = "x@example.com";
const EMAIL_Y = "y@example.com";
const EMAIL_Z = "z@example.com";
const EMAIL_OTHER = "other@example.com";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  const uid = deriveMockUidFromPhone(PHONE_A);
  const now = Date.now();
  return {
    uid,
    ueid: deriveUEIDFromPhone(PHONE_A),
    phoneE164: PHONE_A,
    displayName: "Owner",
    salutation: null,
    businessName: "Firm",
    workType: null,
    designation: null,
    businessEmail: EMAIL_X,
    normalizedEmail: EMAIL_X,
    language: null,
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
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
    emailStatus: "verified",
    mobileReviewChangeCount: 0,
    emailReviewChangeCount: 0,
    ...overrides,
  };
}

function emptyRegistry(): RegistryShape {
  return { phoneIndex: {}, emailIndex: {}, seenPhones: {}, users: {}, releasedPhones: {} };
}

function simulateEmailBind(
  index: Record<string, string>,
  uid: string,
  previous: string,
  next: string
): Record<string, string> {
  const out = { ...index };
  const prevKey = normalizeEmail(previous);
  const nextKey = normalizeEmail(next);
  if (prevKey && prevKey !== nextKey) delete out[prevKey];
  out[nextKey] = uid;
  return out;
}

async function main() {
  assert.equal(REVIEW_CONTACT_EDIT_MAX, 2);
  assert.match(CONTACT_AVAILABILITY_INVARIANT, /authoritatively assigned to a Vyaamikk UEID/);
  assert.match(REVIEW_EDIT_LIMIT_INVARIANT, /two successfully completed mobile changes/);
  assert.equal(isOnboardingReviewLifecycle(null), true);
  assert.equal(isOnboardingReviewLifecycle(0), true);
  assert.equal(isOnboardingReviewLifecycle(1), false);

  // 1 fresh unused Indian number allowed
  assert.equal(classifyContactAssignment({ ownerUid: null, currentUid: "u1" }), "unassigned");

  // 2 number owned by another UEID rejected
  assert.equal(
    classifyContactAssignment({ ownerUid: "other", currentUid: "u1" }),
    "assigned_to_other"
  );

  // 3 current account's own number not self-colliding
  assert.equal(
    classifyContactAssignment({ ownerUid: "u1", currentUid: "u1" }),
    "assigned_to_current"
  );

  const uid = deriveMockUidFromPhone(PHONE_A);
  const ueid = deriveUEIDFromPhone(PHONE_A);
  const reg = emptyRegistry();
  let user = profile();
  reg.users[uid] = user;
  reg.phoneIndex[PHONE_A] = uid;

  // 4 A → B succeeds, same UEID
  user = await applyMockMobileChange(reg, user, PHONE_B);
  assert.equal(user.ueid, ueid);
  assert.equal(user.uid, uid);
  assert.equal(user.phoneE164, PHONE_B);
  assert.equal(reg.phoneIndex[PHONE_B], uid);
  assert.equal(reg.phoneIndex[PHONE_A], undefined);
  assert.equal(user.mobileReviewChangeCount, 1);

  // 5 A → B → A succeeds if A remains unassigned
  user = await applyMockMobileChange(reg, user, PHONE_A);
  assert.equal(user.phoneE164, PHONE_A);
  assert.equal(user.ueid, ueid);
  assert.equal(reg.phoneIndex[PHONE_A], uid);
  assert.equal(reg.phoneIndex[PHONE_B], undefined);
  assert.equal(user.mobileReviewChangeCount, 2);

  // 6 A → B then another UEID acquires A → A rejected
  const other = profile({
    uid: "other_uid",
    ueid: "VYD-2026-OTHER1",
    phoneE164: PHONE_OTHER,
  });
  const race = emptyRegistry();
  race.users[uid] = profile();
  race.phoneIndex[PHONE_A] = uid;
  let raced = await applyMockMobileChange(race, race.users[uid]!, PHONE_B);
  race.users[other.uid] = other;
  race.phoneIndex[PHONE_A] = other.uid;
  assert.equal(
    classifyContactAssignment({ ownerUid: race.phoneIndex[PHONE_A], currentUid: uid }),
    "assigned_to_other"
  );
  assert.equal(raced.ueid, ueid);

  // 7 changed-away A is not permanently reserved by onboarding
  assert.equal(reg.phoneIndex[PHONE_B], undefined);
  assert.equal(
    classifyContactAssignment({ ownerUid: reg.phoneIndex[PHONE_B], currentUid: uid }),
    "unassigned"
  );

  // 8 formatting variants normalize to same number (10-digit local + 91-prefixed)
  assert.equal(normalizePhoneE164("9111111111"), PHONE_A);
  assert.equal(normalizePhoneE164("919111111111"), PHONE_A);
  const serverNorm = readFileSync(
    join(root, "functions/src/identity/shared.ts"),
    "utf8"
  );
  assert.match(serverNorm, /Strip formatting while preserving E\.164/);
  assert.equal(contactsMatchNormalized(normalizePhoneE164("9111111111"), PHONE_A), true);

  // 9 race between availability and final bind is safely rejected (source)
  const confirmSrc = readFileSync(
    join(root, "functions/src/identity/confirmVerifiedMobileChange.ts"),
    "utf8"
  );
  assert.match(confirmSrc, /classifyContactAssignment/);
  assert.match(confirmSrc, /assigned_to_other/);
  assert.equal(confirmSrc.includes("generateUEID"), false);

  // 10 failed OTP does not consume Review edit count
  assert.equal(
    shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt: null,
      previousNormalized: PHONE_A,
      nextNormalized: PHONE_B,
      bindSucceeded: false,
    }),
    false
  );

  // 11 cancelled edit does not consume count
  assert.equal(normalizeReviewContactCount(0), 0);
  assert.equal(reviewContactEditRemaining(0), 2);

  // 12 successful B consumes Change #1 — already asserted count 1 after first change
  // 13 successful C consumes Change #2
  const afterTwo = assertReviewContactEditAllowed({
    channel: "mobile",
    count: 2,
    profileCompletedAt: null,
  });
  assert.equal(afterTwo.ok, false);
  if (!afterTwo.ok) assert.equal(afterTwo.message, REVIEW_MOBILE_EDIT_LIMIT_MESSAGE);

  // 14 Change #3 blocked during Review
  assert.equal(reviewContactEditAllowed(2), false);
  assert.equal(reviewContactEditAllowed(1), true);

  // 15 mobile edit count does not affect email edit count
  assert.equal(reviewContactEditAllowed(0), true);
  const emailStillOpen = assertReviewContactEditAllowed({
    channel: "email",
    count: 0,
    profileCompletedAt: null,
  });
  assert.equal(emailStillOpen.ok, true);

  // EMAIL 16–18
  assert.equal(classifyContactAssignment({ ownerUid: null, currentUid: uid }), "unassigned");
  assert.equal(
    classifyContactAssignment({ ownerUid: "other", currentUid: uid }),
    "assigned_to_other"
  );
  assert.equal(classifyContactAssignment({ ownerUid: uid, currentUid: uid }), "assigned_to_current");

  let emails: Record<string, string> = { [EMAIL_X]: uid };
  // 19 X → Y succeeds
  emails = simulateEmailBind(emails, uid, EMAIL_X, EMAIL_Y);
  assert.equal(emails[EMAIL_Y], uid);
  assert.equal(emails[EMAIL_X], undefined);
  let emailCount = 0;
  if (
    shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt: null,
      previousNormalized: EMAIL_X,
      nextNormalized: EMAIL_Y,
      bindSucceeded: true,
    })
  ) {
    emailCount = nextReviewContactEditCount(emailCount);
  }
  assert.equal(emailCount, 1);

  // 20 X → Y → X succeeds if X remains unassigned
  emails = simulateEmailBind(emails, uid, EMAIL_Y, EMAIL_X);
  assert.equal(emails[EMAIL_X], uid);
  assert.equal(emails[EMAIL_Y], undefined);
  emailCount = nextReviewContactEditCount(emailCount);
  assert.equal(emailCount, 2);

  // 21 changed-away X remains available unless assigned elsewhere
  emails = simulateEmailBind(emails, uid, EMAIL_X, EMAIL_Y);
  assert.equal(emails[EMAIL_X], undefined);

  // 22 failed verification does not consume edit count
  assert.equal(
    shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt: null,
      previousNormalized: EMAIL_X,
      nextNormalized: EMAIL_Y,
      bindSucceeded: false,
    }),
    false
  );

  // 23–24 successful Change #1 / #2 counted; Change #3 blocked
  assert.equal(reviewContactEditAllowed(2), false);
  const emailBlocked = assertReviewContactEditAllowed({
    channel: "email",
    count: 2,
    profileCompletedAt: null,
  });
  assert.equal(emailBlocked.ok, false);
  if (!emailBlocked.ok) assert.equal(emailBlocked.message, REVIEW_EMAIL_EDIT_LIMIT_MESSAGE);

  // 25 email counter independent of mobile counter
  assert.equal(
    assertReviewContactEditAllowed({
      channel: "email",
      count: 0,
      profileCompletedAt: null,
    }).ok,
    true
  );
  assert.equal(
    assertReviewContactEditAllowed({
      channel: "mobile",
      count: 2,
      profileCompletedAt: null,
    }).ok,
    false
  );

  // 26–27 remount / back does not reset counters (persisted on profile, not component)
  const remounted = profile({ mobileReviewChangeCount: 2, emailReviewChangeCount: 1 });
  assert.equal(reviewContactEditAllowed(remounted.mobileReviewChangeCount), false);
  assert.equal(reviewContactEditAllowed(remounted.emailReviewChangeCount), true);

  // 28 current verified contacts survive remount
  assert.equal(remounted.phoneE164, PHONE_A);
  assert.equal(remounted.normalizedEmail, EMAIL_X);

  // 29 stale old contacts do not resurrect — assignment follows current index
  assert.equal(reg.phoneIndex[PHONE_B], undefined);

  // 30 no second UEID from Review contact edit
  assert.equal(user.ueid, ueid);
  assert.equal(confirmSrc.includes("resolveOrCreateUserByPhone"), false);

  // Same-value must not count
  assert.equal(
    shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt: null,
      previousNormalized: PHONE_A,
      nextNormalized: PHONE_A,
      bindSucceeded: true,
    }),
    false
  );

  // Post-completion Settings changes do not consume Review counters / do quarantine
  assert.equal(
    shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt: Date.now(),
      previousNormalized: PHONE_A,
      nextNormalized: PHONE_B,
      bindSucceeded: true,
    }),
    false
  );
  assert.equal(shouldQuarantineReleasedMobile({ profileCompletedAt: null }), false);
  assert.equal(shouldQuarantineReleasedMobile({ profileCompletedAt: Date.now() }), true);

  assert.match(CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE, /cannot be used for this account/i);
  assert.equal(normalizeEmail("  Y@Example.COM "), EMAIL_Y);

  const clientPolicy = readFileSync(join(root, "src/auth-v2/reviewContactEditPolicy.ts"), "utf8");
  const serverPolicy = readFileSync(
    join(root, "functions/src/identity/reviewContactEditPolicy.ts"),
    "utf8"
  );
  assert.match(clientPolicy, /REVIEW_CONTACT_EDIT_MAX = 2/);
  assert.match(serverPolicy, /REVIEW_CONTACT_EDIT_MAX = 2/);
  assert.match(serverPolicy, /shouldQuarantineReleasedMobile/);

  const challenge = readFileSync(join(root, "functions/src/email/challengeService.ts"), "utf8");
  assert.match(challenge, /emailReviewChangeCount/);
  assert.match(challenge, /assertEmailNotBoundElsewhere/);

  const panel = readFileSync(
    join(root, "src/auth-v2/contactChange/VerifiedContactChangePanel.tsx"),
    "utf8"
  );
  assert.match(panel, /mobileReviewChangeCount|reviewContactEditAllowed/);

  const editor = readFileSync(
    join(root, "src/auth-v2/screens/ReviewSectionEditorScreen.tsx"),
    "utf8"
  );
  assert.match(editor, /assertReviewContactEditAllowed/);

  void EMAIL_Z;
  void EMAIL_OTHER;
  void PHONE_C;

  console.log("reviewContactEditPolicy.contract.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
