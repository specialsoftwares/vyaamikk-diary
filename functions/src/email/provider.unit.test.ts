import assert from "node:assert/strict";

import {
  canonicalizeEmailFromAddress,
  isPlausibleResendApiKey,
  resolveEmailProvider,
} from "./provider";

assert.equal(isPlausibleResendApiKey("re_" + "a".repeat(30)), true);
assert.equal(isPlausibleResendApiKey("re_short"), false);
assert.equal(isPlausibleResendApiKey("not-a-key"), false);
assert.equal(isPlausibleResendApiKey("re_abc def"), false);
assert.equal(
  isPlausibleResendApiKey("Vyaamikk Diary <no-reply@example.com>"),
  false
);

assert.equal(
  canonicalizeEmailFromAddress("Vyaamikk Diary <no-reply@vyaamikk.specialsoftwares.com>"),
  "Vyaamikk Diary <no-reply@vyaamikk.specialsoftwares.com>"
);
assert.equal(
  canonicalizeEmailFromAddress("no-reply@vyaamikk.specialsoftwares.com"),
  "no-reply@vyaamikk.specialsoftwares.com"
);
// Duplicated secret paste must be rejected.
const dup =
  "Vyaamikk Diary <no-reply@vyaamikk.specialsoftwares.com>".repeat(4);
assert.equal(canonicalizeEmailFromAddress(dup), null);

const unavailable = resolveEmailProvider({
  EMAIL_PROVIDER_API_KEY: "Vyaamikk Diary <no-reply@example.com>",
  EMAIL_FROM_ADDRESS: "Vyaamikk Diary <no-reply@example.com>",
});
assert.equal(unavailable.mode, "unavailable");

const prod = resolveEmailProvider({
  EMAIL_PROVIDER_API_KEY: "re_" + "x".repeat(40),
  EMAIL_FROM_ADDRESS: "Vyaamikk Diary <No-Reply@Example.com>",
});
assert.equal(prod.mode, "production");

const dev = resolveEmailProvider({
  FUNCTIONS_EMULATOR: "true",
});
assert.equal(dev.mode, "development");

console.log("provider.unit.test.ts: ok");
