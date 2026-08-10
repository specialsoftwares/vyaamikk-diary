import assert from "node:assert/strict";

import {
  deriveIdentityPhaseFromDraft,
  onboardingJourneyStage,
  shouldShowOnboardingProgress,
} from "./onboardingJourney";
import { isPhoneContinueEnabled } from "./phoneValidation";
import { formatLocationCardLines } from "./locationCardModel";
import {
  isIdentityDetailsContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import {
  isIndividualOnboardingPathEnabled,
  isIndividualProfessionalPractice,
} from "@/onboarding/businessConstitution";
import { onboardingJourneyLabel } from "@/auth-v2/theme/onboardingMotion";

assert.equal(onboardingJourneyStage("mobileEntry"), null);
assert.equal(onboardingJourneyStage("phoneOtp"), null);
assert.equal(onboardingJourneyStage("emailEntry"), null);
assert.equal(onboardingJourneyStage("emailOtp"), null);
assert.equal(onboardingJourneyStage("businessIdentity", "details"), "profile");
assert.equal(onboardingJourneyStage("businessIdentity", "location"), "location");

assert.equal(shouldShowOnboardingProgress("mobileEntry"), false);
assert.equal(shouldShowOnboardingProgress("phoneOtp"), false);
assert.equal(shouldShowOnboardingProgress("emailEntry"), false);
assert.equal(shouldShowOnboardingProgress("emailOtp"), false);
assert.equal(shouldShowOnboardingProgress("businessIdentity"), true);

assert.equal(isIndividualOnboardingPathEnabled(), false);
assert.equal(onboardingJourneyLabel("profile"), "Profile");
assert.equal(onboardingJourneyLabel("location"), "Location");
assert.equal(
  isIndividualProfessionalPractice("Individual Professional / Sole Practice"),
  true
);
assert.equal(isIndividualProfessionalPractice("individual_professional"), true);
assert.equal(isIndividualProfessionalPractice("Proprietorship"), false);

assert.equal(
  deriveIdentityPhaseFromDraft({
    displayName: "",
    accountKind: "business",
    businessName: "",
    constitution: "",
    confirmedLocationPin: null,
    pinCode: "",
  }),
  "details"
);
assert.equal(
  deriveIdentityPhaseFromDraft({
    displayName: "Ada",
    accountKind: "business",
    businessName: "Sharma Hardware",
    constitution: "Proprietorship",
    confirmedLocationPin: null,
    pinCode: "201016",
  }),
  "location"
);
assert.equal(
  deriveIdentityPhaseFromDraft({
    displayName: "Shivam Saurav",
    accountKind: "business",
    businessName: "",
    constitution: "Individual Professional / Sole Practice",
    confirmedLocationPin: null,
    pinCode: "201016",
  }),
  "location"
);

assert.equal(isPhoneContinueEnabled({ valid: false, online: true, loading: false }), false);
assert.equal(isPhoneContinueEnabled({ valid: true, online: true, loading: false }), true);

assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Ada",
    accountKind: "individual",
    businessName: "",
  }),
  true,
  "historical individual hydration still continues on name only"
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Ada",
    accountKind: "business",
    businessName: "Sharma Hardware",
    constitution: "",
  }),
  false
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Ada",
    accountKind: "business",
    businessName: "Sharma Hardware",
    constitution: "Proprietorship",
  }),
  true
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Ada",
    accountKind: "business",
    businessName: "Sharma Hardware",
    constitution: "Proprietorship",
    gstin: "ABC",
    gstinVerificationState: "formatInvalid",
  }),
  false
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Shivam Saurav",
    accountKind: "business",
    businessName: "",
    constitution: "Individual Professional / Sole Practice",
  }),
  true,
  "sole practice may continue without a separate practice name"
);
assert.equal(
  isIdentityDetailsContinueEnabled({
    displayName: "Shivam Saurav",
    accountKind: "business",
    businessName: "",
    constitution: "Private Limited Company",
  }),
  false
);

const lines = formatLocationCardLines({
  locality: "Crossing Republik",
  district: "Ghaziabad",
  state: "Uttar Pradesh",
});
assert.equal(lines.title, "Crossing Republik");
assert.equal(lines.subtitle, "Ghaziabad · Uttar Pradesh");

const draft: OnboardingProfileDraftV2 = {
  schemaVersion: 2,
  uid: "u1",
  environment: "local-mock",
  accountKind: "individual",
  displayName: "Ada",
  businessName: "",
  constitution: "",
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
};

const completion = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft,
});
assert.equal(completion.ok, true, "historical individual fixture still hydrates/completes");

const businessDraft: OnboardingProfileDraftV2 = {
  ...draft,
  accountKind: "business",
  businessName: "Sharma Hardware",
  constitution: "Proprietorship",
};
const businessOk = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: businessDraft,
});
assert.equal(businessOk.ok, true);

const missingConst = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: { ...businessDraft, constitution: "" },
});
assert.equal(missingConst.ok, false);
if (!missingConst.ok) assert.equal(missingConst.blocker, "constitution_required");

const soleDraft: OnboardingProfileDraftV2 = {
  ...draft,
  accountKind: "business",
  displayName: "Shivam Saurav",
  businessName: "",
  constitution: "Individual Professional / Sole Practice",
};
const soleOk = validateOnboardingDraftForCompletion({
  signedIn: true,
  emailVerified: true,
  phoneE164: "+919876543210",
  email: "a@b.co",
  draft: soleDraft,
});
assert.equal(soleOk.ok, true);
assert.equal(soleDraft.accountKind, "business");

console.log("onboardingJourney.test.ts: ok");
