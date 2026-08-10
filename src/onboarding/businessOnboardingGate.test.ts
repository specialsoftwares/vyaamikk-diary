import assert from "node:assert/strict";

import {
  BUSINESS_CONSTITUTIONS,
  BUSINESS_PRACTICE_TYPES,
  isIndividualOnboardingPathEnabled,
  isIndividualProfessionalPractice,
  isRecognizedBusinessConstitution,
  NEW_REGISTRATION_ACCOUNT_KIND,
  practiceTypeIdFromValue,
  practiceTypeLabelFromValue,
} from "./businessConstitution";
import { evaluateGstinInput, gstinChecksumValid } from "./gstinVerificationState";
import { normalizeGstin } from "@/utils/gst/gstin";
import {
  isIdentityDetailsContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "./profileIdentityModel";

assert.equal(isIndividualOnboardingPathEnabled(), false);
assert.equal(NEW_REGISTRATION_ACCOUNT_KIND, "business");
assert.ok(BUSINESS_CONSTITUTIONS.includes("Proprietorship"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Individual Professional / Sole Practice"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Limited Liability Partnership (LLP)"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Private Limited Company"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Public Limited Company"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("One Person Company (OPC)"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Hindu Undivided Family (HUF)"));
assert.ok(BUSINESS_CONSTITUTIONS.includes("Co-operative Society"));
assert.equal(BUSINESS_PRACTICE_TYPES.some((t) => t.id === "individual_professional"), true);
assert.equal(practiceTypeIdFromValue("Private Limited Company"), "private_limited");
assert.equal(practiceTypeLabelFromValue("private_limited"), "Private Limited Company");
assert.equal(practiceTypeLabelFromValue("llp"), "Limited Liability Partnership (LLP)");
assert.equal(isIndividualProfessionalPractice("Individual Professional / Sole Practice"), true);
assert.equal(isRecognizedBusinessConstitution("Proprietorship"), true);
assert.equal(isRecognizedBusinessConstitution("Freelancer"), false);
assert.equal(isRecognizedBusinessConstitution("Individual"), false);

assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Ada",
    accountKind: "business",
    businessName: "",
    constitution: "Proprietorship",
  }),
  false
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "",
    accountKind: "business",
    businessName: "Sharma Hardware",
    constitution: "Proprietorship",
  }),
  false
);

assert.equal(normalizeGstin(" 27aapfu0939f1zv "), "27AAPFU0939F1ZV".slice(0, 15));
assert.equal(normalizeGstin("abc").length <= 15, true);
assert.equal(evaluateGstinInput("").state, "notProvided");
assert.equal(evaluateGstinInput("ABC").state, "formatInvalid");

const sample = "27AAPFU0939F1ZV";
const ev = evaluateGstinInput(sample);
if (gstinChecksumValid(sample)) {
  assert.notEqual(ev.state, "officiallyVerified");
  assert.notEqual(ev.state, "formatValid");
}

function draft(over: Partial<OnboardingProfileDraftV2> = {}): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid: "u1",
    environment: "local-mock",
    accountKind: "business",
    displayName: "Ada Lovelace",
    businessName: "Sharma Hardware",
    constitution: "Proprietorship",
    gstin: "",
    gstinVerificationState: "notProvided",
    pinCode: "201016",
    pinLocalityChoices: [],
    selectedLocality: "Crossing Republik",
    confirmedLocation: {
      pinCode: "201016",
      locality: "Crossing Republik",
      district: "Ghaziabad",
      state: "Uttar Pradesh",
      country: "India",
      confirmedAt: 1,
      source: "api",
    },
    profileLogo: null,
    logoPreviewUri: null,
    logoPersisted: false,
    updatedAt: 1,
    ...over,
  };
}

const blankGstin = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: draft({ gstin: "", gstinVerificationState: "notProvided" }),
});
assert.equal(blankGstin.ok, true);

const badGstin = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: draft({ gstin: "ABC", gstinVerificationState: "formatInvalid" }),
});
assert.equal(badGstin.ok, false);

const sole = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: draft({
    displayName: "Shivam Saurav",
    businessName: "",
    constitution: "Individual Professional / Sole Practice",
    gstin: "",
    gstinVerificationState: "notProvided",
  }),
});
assert.equal(sole.ok, true);
assert.equal(isIndividualOnboardingPathEnabled(), false);

console.log("businessOnboardingGate.test.ts: ok");
