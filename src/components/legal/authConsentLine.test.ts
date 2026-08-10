import assert from "node:assert/strict";

import {
  AUTH_CONSENT_JOINER,
  authConsentSentencePreview,
  authConsentShouldStaySingleLine,
  isAuthLegalConsentReady,
} from "./authConsentLine";

const sentence = authConsentSentencePreview({
  prefix: "I agree to the",
  termsLabel: "Terms of Use",
  privacyLabel: "Privacy Policy",
});

assert.equal(sentence, "I agree to the Terms of Use & Privacy Policy");
assert.equal(AUTH_CONSENT_JOINER, " & ");
assert.ok(sentence.includes("Terms of Use"));
assert.ok(sentence.includes("Privacy Policy"));
assert.equal(sentence.includes("·"), false);
assert.notEqual(sentence.indexOf("Terms of Use"), sentence.indexOf("Privacy Policy"));
assert.equal(authConsentShouldStaySingleLine(1), true);
assert.equal(authConsentShouldStaySingleLine(1.2), true);
assert.equal(authConsentShouldStaySingleLine(1.5), false);
assert.equal(isAuthLegalConsentReady(true, true), true);
assert.equal(isAuthLegalConsentReady(true, false), false);
assert.equal(isAuthLegalConsentReady(false, true), false);
assert.equal(isAuthLegalConsentReady(false, false), false);

console.log("authConsentLine.test.ts: ok");
