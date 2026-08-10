/**
 * Regression: LegalConsentCheckboxes must not render raw consent.* keys in English.
 */
import assert from "node:assert/strict";

import enJson from "./locales/en.json";
import { i18n, initI18n, translateSync } from "./i18n";

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

  console.log("consentLocale.test.ts: ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
