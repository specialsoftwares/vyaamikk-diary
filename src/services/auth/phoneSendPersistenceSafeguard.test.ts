/**
 * Phone Send paints OTP without awaiting consent / wrapper-challenge writes.
 * Native Firebase session still persists before the send promise resolves.
 * Identity checkpoint rebuilds missing consent; persist failure is not auth.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  challengePersistFailureDoesNotAuthenticate,
  maySkipAwaitBeforeOtpScreenPaint,
  persistFailureEffect,
} from "@/services/auth/phoneSendPersistencePolicy";
import {
  CONSENT_RECONCILE_SOURCE,
  resolvePendingConsentForVerifiedProfile,
} from "@/services/consent/pendingConsentReconcile";
import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";

const root = join(__dirname, "../..");
const gateSrc = readFileSync(join(root, "auth-v2/AuthFlowGate.tsx"), "utf8");
const nativeSrc = readFileSync(join(root, "services/auth/nativePhoneAuth.ts"), "utf8");
const consentSrc = readFileSync(join(root, "services/consent/legalConsentService.ts"), "utf8");

assert.equal(maySkipAwaitBeforeOtpScreenPaint("pending_consent"), true);
assert.equal(maySkipAwaitBeforeOtpScreenPaint("wrapper_challenge"), true);
assert.equal(maySkipAwaitBeforeOtpScreenPaint("native_firebase_session"), false);
assert.equal(persistFailureEffect("pending_consent"), "resumability_only");
assert.equal(persistFailureEffect("wrapper_challenge"), "resumability_only");
assert.equal(persistFailureEffect("native_firebase_session"), "must_not_fail_open_auth");
assert.equal(challengePersistFailureDoesNotAuthenticate(), true);

assert.match(nativeSrc, /await saveNativePhoneAuthSession\(/);
assert.match(gateSrc, /void savePendingConsent\(/);
assert.match(gateSrc, /setStep\("otp"\)/);
assert.match(gateSrc, /void saveAuthWrapperChallenge\(/);
assert.equal(/await savePendingConsent\(/.test(gateSrc), false);
assert.equal(/await saveAuthWrapperChallenge\(/.test(gateSrc), false);

const otpIdx = gateSrc.indexOf('setStep("otp")');
const challengeIdx = gateSrc.indexOf("void saveAuthWrapperChallenge");
assert.ok(otpIdx >= 0 && challengeIdx > otpIdx, "wrapper challenge persist stays after OTP paint");

const retryAfterPaint = gateSrc.includes(
  'void savePendingConsent(sendPhone, "auth_v2_phone_confirm")'
);
assert.equal(retryAfterPaint, true);

assert.match(consentSrc, /resolvePendingConsentForVerifiedProfile/);
assert.match(consentSrc, /CONSENT_RECONCILE_SOURCE/);

const record = (source: string, phone: string): LegalConsentRecord => ({
  consentVersion: "1.0.0",
  termsVersion: "1.0.0",
  privacyVersion: "1.0.0",
  effectiveDate: "2026-07-01",
  acceptedAt: 1,
  phoneE164: phone as LegalConsentRecord["phoneE164"],
  appVersion: "1.0.0",
  platform: "android",
  sourceScreen: source,
});

const pending: PendingLegalConsent = {
  phoneE164: "+919999990001" as PendingLegalConsent["phoneE164"],
  record: record("auth_v2_phone_confirm", "+919999990001"),
};

assert.equal(
  resolvePendingConsentForVerifiedProfile({
    pending,
    verifiedPhoneE164: "+919999990001",
    hasCurrentConsentVersion: false,
    rebuildRecord: record(CONSENT_RECONCILE_SOURCE, "+919999990001"),
  })?.record.sourceScreen,
  "auth_v2_phone_confirm"
);

const rebuilt = resolvePendingConsentForVerifiedProfile({
  pending: null,
  verifiedPhoneE164: "+919999990001",
  hasCurrentConsentVersion: false,
  rebuildRecord: record(CONSENT_RECONCILE_SOURCE, "+919999990001"),
});
assert.equal(rebuilt?.record.sourceScreen, CONSENT_RECONCILE_SOURCE);
assert.equal(rebuilt?.phoneE164, "+919999990001");

assert.equal(
  resolvePendingConsentForVerifiedProfile({
    pending: null,
    verifiedPhoneE164: "+919999990001",
    hasCurrentConsentVersion: true,
    rebuildRecord: record(CONSENT_RECONCILE_SOURCE, "+919999990001"),
  }),
  null
);

assert.equal(
  resolvePendingConsentForVerifiedProfile({
    pending: {
      phoneE164: "+919999990002" as PendingLegalConsent["phoneE164"],
      record: record("auth_v2_phone_confirm", "+919999990002"),
    },
    verifiedPhoneE164: "+919999990001",
    hasCurrentConsentVersion: false,
    rebuildRecord: record(CONSENT_RECONCILE_SOURCE, "+919999990001"),
  })?.phoneE164,
  "+919999990001"
);

console.log("phoneSendPersistenceSafeguard.test.ts: ok");
