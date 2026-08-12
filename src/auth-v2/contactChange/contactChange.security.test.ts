import assert from "node:assert/strict";

import {
  assertSingleContactChange,
  CONTACT_CHANGE_PURPOSE,
  pendingMustNotLeak,
  validateReplacementEmail,
  validateReplacementMobile,
} from "@/auth-v2/contactChange/contactChangeModel";
import { REVIEW_SECTION_ACTION_LABELS } from "@/auth-v2/reviewEditCopy";
import { applyReviewEditPatch, reviewEditAllowsPinLookup } from "@/auth-v2/reviewEditIntent";
import { AppError } from "@/domain/errors";
import { applyMockMobileChange } from "@/services/auth/identityRegistry/mockMobile";
import type { RegistryShape } from "@/services/auth/mockRegistry";
import type { UserProfile } from "@/domain/types";
import { deriveMockUidFromPhone, deriveUEIDFromPhone } from "@/utils/ueid";

assert.equal(CONTACT_CHANGE_PURPOSE, "contact_change");

assert.equal(REVIEW_SECTION_ACTION_LABELS.contacts.action, "Change");
assert.equal(REVIEW_SECTION_ACTION_LABELS.identity.action, "Edit");
assert.equal(REVIEW_SECTION_ACTION_LABELS.media.accessibilityLabel, "Edit business logo");

const samePhone = validateReplacementMobile({
  localNumber: "9876543210",
  currentPhoneE164: "+919876543210",
});
assert.equal(samePhone.ok, false);
if (!samePhone.ok) {
  assert.match(samePhone.message, /already your verified mobile/i);
}

const badPhone = validateReplacementMobile({
  localNumber: "123",
  currentPhoneE164: "+919876543210",
});
assert.equal(badPhone.ok, false);

const okPhone = validateReplacementMobile({
  localNumber: "9988776655",
  currentPhoneE164: "+919876543210",
});
assert.equal(okPhone.ok, true);
if (okPhone.ok) assert.equal(okPhone.phoneE164, "+919988776655");

assert.equal(
  validateReplacementEmail({ email: "a@b.com", currentEmail: "a@b.com" }).ok,
  false
);
assert.equal(validateReplacementEmail({ email: "not-an-email", currentEmail: "a@b.com" }).ok, false);
assert.equal(validateReplacementEmail({ email: "new@b.com", currentEmail: "a@b.com" }).ok, true);

assert.equal(
  pendingMustNotLeak({
    currentVerified: "+919876543210",
    pendingInput: "+919988776655",
    verificationSucceededFor: null,
  }),
  "+919876543210"
);

assert.throws(
  () => assertSingleContactChange("phone", "email"),
  (e: unknown) => e instanceof AppError
);
assert.doesNotThrow(() => assertSingleContactChange(null, "phone"));
assert.doesNotThrow(() => assertSingleContactChange("phone", "phone"));

async function main() {
const PHONE_A = "+919111111111";
const PHONE_B = "+919222222222";
const now = Date.now();
const uid = deriveMockUidFromPhone(PHONE_A);
const ueid = deriveUEIDFromPhone(PHONE_A);

const profile: UserProfile = {
  uid,
  ueid,
  phoneE164: PHONE_A,
  displayName: "Owner",
  salutation: null,
  businessName: "Firm",
  workType: null,
  designation: null,
  businessEmail: "owner@firm.test",
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
};

const registry: RegistryShape = {
  users: { [uid]: profile },
  phoneIndex: { [PHONE_A]: uid },
  seenPhones: { [PHONE_A]: true },
  emailIndex: {},
  releasedPhones: {},
};

const next = await applyMockMobileChange(registry, profile, PHONE_B);
assert.equal(next.uid, uid);
assert.equal(next.ueid, ueid);
assert.equal(next.phoneE164, PHONE_B);
assert.equal(registry.phoneIndex[PHONE_B], uid);
assert.equal(registry.phoneIndex[PHONE_A], undefined);

const base = {
  displayName: "A",
  businessName: "B",
  constitution: "Private Limited",
  gstin: "22AAAAA0000A1Z5",
  pinCode: "560001",
  confirmedLocality: "X",
  confirmedDistrict: "Y",
  confirmedState: "KA",
  logoPreviewUri: "file://logo.png",
  phoneE164: PHONE_A,
  email: "a@b.com",
};
const afterPhone = applyReviewEditPatch(base, "contacts", { phoneE164: PHONE_B });
assert.equal(afterPhone.displayName, "A");
assert.equal(afterPhone.businessName, "B");
assert.equal(afterPhone.constitution, "Private Limited");
assert.equal(afterPhone.gstin, base.gstin);
assert.equal(afterPhone.pinCode, "560001");
assert.equal(afterPhone.logoPreviewUri, "file://logo.png");
assert.equal(afterPhone.phoneE164, PHONE_B);
assert.equal(reviewEditAllowsPinLookup("contacts"), false);

console.log("contactChange.security.test.ts: ok");
}

void main();