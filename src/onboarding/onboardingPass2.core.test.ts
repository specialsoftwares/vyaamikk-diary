/**
 * Unit tests for profile identity model, PIN confirmation, GSTIN, email send machine,
 * offline capability guard, issuer snapshot disclosure, remediation.
 */

import assert from "node:assert/strict";

import {
  buildDocumentFacingIdentity,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "./profileIdentityModel";
import {
  acceptPinInput,
  applyPinLookupResult,
  confirmPinLocation,
  nextPinLookupRequestId,
} from "./pinConfirmation";
import { evaluateGstinInput, gstinChecksumValid, gstinUserFacingLabel } from "./gstinVerificationState";
import { applyPdfContactDisclosure } from "./issuerIdentitySnapshot";
import { resolveProfileRemediation } from "./profileRemediation";
import { validateIdentityMediaCandidate } from "./identityMediaValidation";
import {
  beginEmailOtpSend,
  canVerifyEmailOtp,
  completeEmailOtpSend,
  createEmailOtpSendMachine,
  failEmailOtpSend,
  isBackBlockedDuringEmailSend,
  setRetainedDigits,
} from "@/auth/emailOtpSendMachine";
import {
  __resetCapabilityGuardForTests,
  assertMutationAllowed,
  canEnterMutatingFeature,
  resolveCapabilityState,
} from "@/auth/offlineCapabilityGuard";
import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { OFFLINE_FULL_ACCESS_MS } from "@/auth/offlineAccessPolicy";

function baseDraft(over: Partial<OnboardingProfileDraftV2> = {}): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid: "u1",
    environment: "local-mock",
    accountKind: "individual",
    displayName: "Ada Lovelace",
    businessName: "",
    constitution: "",
    gstin: "",
    gstinVerificationState: "notProvided",
    pinCode: "110001",
    pinLocalityChoices: [],
    selectedLocality: "Connaught Place",
    confirmedLocation: {
      pinCode: "110001",
      locality: "Connaught Place",
      district: "New Delhi",
      state: "Delhi",
      country: "India",
      confirmedAt: 1,
      source: "offline",
    },
    profileLogo: {
      localUri: "file:///tmp/logo.jpg",
      mimeType: "image/jpeg",
      updatedAt: 1,
    },
    logoPreviewUri: null,
    logoPersisted: true,
    updatedAt: 1,
    ...over,
  };
}

function baseUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VD-TEST",
    phoneE164: "+919876543210",
    displayName: "Ada",
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: "ada@example.com",
    normalizedEmail: "ada@example.com",
    emailStatus: "verified",
    emailVerifiedAt: 1,
    language: "en",
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { includeProfileLogo: true },
    lastLoginAt: null,
    previousLoginAt: null,
    lastActiveAt: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...over,
  };
}

// --- Individual / Business mandatory ---
{
  const ok = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "ada@example.com",
    draft: baseDraft(),
  });
  assert.equal(ok.ok, true);
}

{
  const bad = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "ada@example.com",
    draft: baseDraft({ displayName: "" }),
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.blocker, "display_name_required");
}

{
  const biz = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "ada@example.com",
    draft: baseDraft({
      accountKind: "business",
      businessName: "Analytical Engines",
      displayName: "Ada Lovelace",
      constitution: "Proprietorship",
    }),
  });
  assert.equal(biz.ok, true);
}

{
  const bizBad = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "ada@example.com",
    draft: baseDraft({ accountKind: "business", businessName: "" }),
  });
  assert.equal(bizBad.ok, false);
}

{
  const identity = buildDocumentFacingIdentity({
    draft: baseDraft({
      accountKind: "business",
      businessName: "Analytical Engines",
      displayName: "Ada Lovelace",
      constitution: "Proprietorship",
    }),
    phoneE164: "+919876543210",
    email: "ada@example.com",
    snapshotVersion: 1,
    now: 10,
  });
  assert.equal(identity.primaryName, "Analytical Engines");
  assert.equal(identity.accountOwnerName, "Ada Lovelace");
  assert.equal(identity.constitution, "Proprietorship");
}

{
  const sole = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "ada@example.com",
    draft: baseDraft({
      accountKind: "business",
      businessName: "",
      displayName: "Ada Lovelace",
      constitution: "Individual Professional / Sole Practice",
    }),
  });
  assert.equal(sole.ok, true);
}

{
  const identity = buildDocumentFacingIdentity({
    draft: baseDraft({
      accountKind: "business",
      businessName: "",
      displayName: "Ada Lovelace",
      constitution: "Individual Professional / Sole Practice",
    }),
    phoneE164: "+919876543210",
    email: "ada@example.com",
    snapshotVersion: 1,
    now: 10,
  });
  assert.equal(identity.accountKind, "business");
  assert.equal(identity.primaryName, "Ada Lovelace");
  assert.equal(identity.accountOwnerName, "Ada Lovelace");
  assert.equal(identity.constitution, "Individual Professional / Sole Practice");
}

// --- GSTIN ---
{
  assert.equal(evaluateGstinInput("").state, "notProvided");
  const malformed = evaluateGstinInput("ABC");
  assert.equal(malformed.state, "formatInvalid");
  const spaced = evaluateGstinInput(" 27ABCDE1234F1Z5 ");
  assert.equal(spaced.state, "formatInvalid");
  // Structurally valid sample — checksum may fail; if checksum passes → verificationUnavailable
  const sample = "27AAPFU0939F1ZV";
  const ev = evaluateGstinInput(sample);
  if (gstinChecksumValid(sample) && sample.length === 15) {
    assert.equal(ev.state, "verificationUnavailable");
    assert.match(gstinUserFacingLabel(ev.state), /official verification unavailable/i);
  } else {
    assert.ok(ev.state === "formatInvalid" || ev.state === "verificationUnavailable");
  }
  const badSubmit = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "a@b.co",
    draft: baseDraft({ gstin: "BAD", gstinVerificationState: "formatInvalid" }),
  });
  assert.equal(badSubmit.ok, false);
}

// --- PIN ---
{
  assert.equal(acceptPinInput("110001"), "110001");
  assert.equal(acceptPinInput("110 001"), null);
  assert.equal(acceptPinInput("११०००१"), null);
  assert.equal(acceptPinInput("1100017"), null);
  const id1 = nextPinLookupRequestId();
  const id2 = nextPinLookupRequestId();
  assert.ok(id2 > id1);
  const stale = applyPinLookupResult({
    requestId: id1,
    latestRequestId: id2,
    pinCode: "110001",
    currentPinCode: "110001",
    resolution: {
      pinCode: "110001",
      success: true,
      source: "offline",
      localities: ["A"],
      defaultLocality: "A",
      district: "New Delhi",
      state: "Delhi",
      country: "India",
    },
  });
  assert.equal(stale, null);
  const multi = applyPinLookupResult({
    requestId: id2,
    latestRequestId: id2,
    pinCode: "110001",
    currentPinCode: "110001",
    resolution: {
      pinCode: "110001",
      success: true,
      source: "offline",
      localities: ["A", "B"],
      defaultLocality: "A",
      district: "New Delhi",
      state: "Delhi",
      country: "India",
    },
  });
  assert.equal(multi?.status, "choices");
  const confirmed = confirmPinLocation({
    pinCode: "110001",
    locality: "A",
    district: "New Delhi",
    state: "Delhi",
    source: "offline",
    now: 5,
  });
  const mismatch = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "a@b.co",
    draft: baseDraft({ pinCode: "560001", confirmedLocation: confirmed }),
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.blocker, "pin_mismatch");
}

// --- Image validation ---
{
  const heic = validateIdentityMediaCandidate({
    mimeType: "image/heic",
    width: 400,
    height: 400,
    approxBytes: 1000,
    uri: "file://x.heic",
    base64: "aaaa",
  });
  assert.equal(heic.ok, false);
  if (!heic.ok) assert.equal(heic.reason, "heic_unreadable");

  const corrupt = validateIdentityMediaCandidate({
    mimeType: "image/jpeg",
    width: 400,
    height: 400,
    approxBytes: 1000,
    uri: "",
    base64: null,
  });
  assert.equal(corrupt.ok, false);

  const okImg = validateIdentityMediaCandidate({
    mimeType: "image/jpeg",
    width: 400,
    height: 400,
    approxBytes: 1000,
    uri: "file://x.jpg",
    base64: "abcd",
  });
  assert.equal(okImg.ok, true);

  const okUriOnly = validateIdentityMediaCandidate({
    mimeType: "image/jpeg",
    width: 400,
    height: 400,
    approxBytes: 1000,
    uri: "file://x.jpg",
    base64: null,
  });
  assert.equal(okUriOnly.ok, true);

  const noLogo = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "a@b.co",
    draft: baseDraft({ profileLogo: null, logoPersisted: false }),
  });
  assert.equal(noLogo.ok, true, "profile image is optional for V1 onboarding completion");
}

// --- PDF disclosure ---
{
  const identity = buildDocumentFacingIdentity({
    draft: baseDraft(),
    phoneE164: "+919876543210",
    email: "ada@example.com",
    snapshotVersion: 1,
  });
  const hidden = applyPdfContactDisclosure(identity, {
    showMobile: false,
    showEmail: false,
  });
  assert.equal(hidden.phoneE164, "");
  assert.equal(hidden.email, "");
  assert.equal(hidden.phoneHidden, true);
  assert.equal(hidden.emailHidden, true);
}

// --- Remediation ---
{
  assert.equal(resolveProfileRemediation(null), "accountDataInconsistent");
  assert.equal(
    resolveProfileRemediation(baseUser({ emailStatus: "unverified", emailVerifiedAt: null })),
    "emailRemediationRequired"
  );
  assert.equal(
    resolveProfileRemediation(
      baseUser({
        profileCompletedAt: 1,
        onboardingProfileVersion: 2,
        accountKind: "individual",
        pinCode: "110001",
        pinDistrict: "New Delhi",
        pinState: "Delhi",
        profileLogo: { localUri: "file://x", mimeType: "image/jpeg", updatedAt: 1 },
        issuerIdentitySnapshotId: "iss_1",
      })
    ),
    "fullyCompliant"
  );
  assert.equal(
    resolveProfileRemediation(
      baseUser({
        profileCompletedAt: 1,
        displayName: "Legacy",
        profileLogo: null,
      })
    ),
    "pinConfirmationRequired"
  );
  assert.equal(
    resolveProfileRemediation(
      baseUser({
        profileCompletedAt: 1,
        onboardingProfileVersion: 2,
        accountKind: "individual",
        pinCode: "110001",
        pinDistrict: "New Delhi",
        pinState: "Delhi",
        profileLogo: null,
        issuerIdentitySnapshotId: "iss_1",
      })
    ),
    "fullyCompliant",
    "optional logo must not force image remediation"
  );
}

// --- Email send machine ---
{
  let m = createEmailOtpSendMachine();
  m = beginEmailOtpSend(m);
  assert.equal(m.state, "sending");
  assert.equal(isBackBlockedDuringEmailSend(m), true);
  assert.equal(canVerifyEmailOtp(m), false);
  m = setRetainedDigits(m, "123456");
  const gen = m.generation;
  const late = completeEmailOtpSend(m, gen - 1, {
    challengeId: "c1",
    expiresAt: 9,
    resendAvailableAt: 8,
  });
  assert.equal(late, null);
  const ok = completeEmailOtpSend(m, gen, {
    challengeId: "c1",
    expiresAt: 9,
    resendAvailableAt: 8,
  });
  assert.ok(ok);
  assert.equal(ok!.state, "challengeCreated");
  assert.equal(canVerifyEmailOtp(ok!), true);
  assert.equal(isBackBlockedDuringEmailSend(ok!), false);
  assert.equal(ok!.retainedDigits, "123456");

  let f = beginEmailOtpSend(createEmailOtpSendMachine());
  const failed = failEmailOtpSend(f, f.generation, "OTP could not be sent");
  assert.equal(failed?.state, "failed");
  assert.equal(isBackBlockedDuringEmailSend(failed!), false);
  assert.equal(canVerifyEmailOtp(failed!), false);
}

// --- Offline capability ---
{
  __resetCapabilityGuardForTests({ isOnline: false, lastValidationAt: Date.now() });
  assert.equal(
    resolveCapabilityState({
      isOnline: false,
      lastSuccessfulOnlineValidationAt: Date.now(),
    }),
    "offlineFullAccess"
  );
  assert.equal(
    canEnterMutatingFeature({
      isOnline: false,
      lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
    }).allowed,
    false
  );
  try {
    assertMutationAllowed(
      {
        isOnline: false,
        lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
      },
      "create"
    );
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.code, "offline_read_only");
  }
  try {
    assertMutationAllowed(
      {
        isOnline: false,
        lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
      },
      "pdf"
    );
    assert.fail("expected pdf block");
  } catch (e) {
    assert.ok(e instanceof AppError);
  }
  try {
    assertMutationAllowed(
      {
        isOnline: false,
        lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
      },
      "share"
    );
    assert.fail("expected share block");
  } catch (e) {
    assert.ok(e instanceof AppError);
  }
  try {
    assertMutationAllowed(
      {
        isOnline: false,
        lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
      },
      "sync"
    );
    assert.fail("expected sync block");
  } catch (e) {
    assert.ok(e instanceof AppError);
  }
  // Inside window — allowed
  assertMutationAllowed(
    {
      isOnline: false,
      lastSuccessfulOnlineValidationAt: Date.now(),
    },
    "create"
  );
  // Revoked
  try {
    assertMutationAllowed(
      {
        isOnline: true,
        lastSuccessfulOnlineValidationAt: Date.now(),
        sessionRevoked: true,
      },
      "create"
    );
    assert.fail("expected revoked");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.code, "permission_denied");
  }
}

console.log("onboardingPass2.core.test.ts: all cases passed");
