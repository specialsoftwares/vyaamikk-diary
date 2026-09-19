/**
 * Regression: first-launch consent and OTP copy must not render raw i18n keys.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import enJson from "./locales/en.json";
import { changeAppLanguage, i18n, initI18n, translateSync } from "./i18n";

const here = dirname(fileURLToPath(import.meta.url));

async function run() {
  const consent = (enJson as { consent?: Record<string, string> }).consent;
  assert.ok(consent, "en.json has consent object");
  assert.equal(typeof consent.termsPrefix, "string");
  assert.equal(typeof consent.privacyPrefix, "string");
  assert.ok(consent.termsPrefix.trim().length > 0);
  assert.ok(consent.privacyPrefix.trim().length > 0);
  assert.notEqual(consent.termsPrefix, "consent.termsPrefix");
  assert.notEqual(consent.privacyPrefix, "consent.privacyPrefix");
  // Prefixes must not duplicate the link labels rendered separately.
  assert.ok(!/terms of use/i.test(consent.termsPrefix));
  assert.ok(!/privacy policy/i.test(consent.privacyPrefix));

  await initI18n("en");
  await i18n.changeLanguage("en");
  const termsPrefix = translateSync("en", "consent.termsPrefix");
  const privacyPrefix = translateSync("en", "consent.privacyPrefix");
  assert.equal(termsPrefix, consent.termsPrefix);
  assert.equal(privacyPrefix, consent.privacyPrefix);
  assert.notEqual(termsPrefix, "consent.termsPrefix");
  assert.notEqual(privacyPrefix, "consent.privacyPrefix");

  await changeAppLanguage("hi");
  const hiTerms = translateSync("hi", "consent.termsPrefix");
  const hiPrivacy = translateSync("hi", "consent.privacyPrefix");
  assert.notEqual(hiTerms, "consent.termsPrefix");
  assert.notEqual(hiPrivacy, "consent.privacyPrefix");
  assert.notEqual(hiTerms, termsPrefix);
  assert.notEqual(hiPrivacy, privacyPrefix);

  const otpKeys = [
    "otp.resend",
    "otp.resending",
    "otp.resendCountdown",
    "authV2.emailOtp.sending",
  ] as const;
  for (const key of otpKeys) {
    const en = translateSync("en", key, { time: "00:45" });
    const hi = translateSync("hi", key, { time: "00:45" });
    assert.notEqual(en, key, `${key} must resolve in English`);
    assert.notEqual(hi, key, `${key} must resolve in Hindi`);
    assert.notEqual(hi, en, `${key} Hindi must not be the English shell`);
    assert.equal(en.includes(key), false);
    assert.equal(hi.includes(key), false);
  }
  assert.match(translateSync("en", "otp.resendCountdown", { time: "00:45" }), /00:45/);
  assert.match(translateSync("hi", "otp.resendCountdown", { time: "00:45" }), /00:45/);

  const phoneOtp = readFileSync(join(here, "../auth-v2/screens/OtpVerificationScreen.tsx"), "utf8");
  const emailOtp = readFileSync(join(here, "../auth-v2/screens/EmailOtpScreen.tsx"), "utf8");
  assert.match(phoneOtp, /t\("otp\.resend"\)/);
  assert.match(phoneOtp, /t\("otp\.resendCountdown"/);
  assert.equal(phoneOtp.includes('"Resend OTP"'), false);
  assert.match(emailOtp, /t\("otp\.resendCountdown"/);
  assert.match(emailOtp, /t\("authV2\.emailOtp\.sending"\)/);
  assert.equal(emailOtp.includes("Sending OTP…"), false);

  console.log("consentLocale.test.ts: ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
