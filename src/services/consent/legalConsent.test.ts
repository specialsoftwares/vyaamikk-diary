import assert from "node:assert/strict";

import { findLegalConfigBlockers, legal } from "../../config/legal";

assert.ok(legal.privacyUrl.includes("vyaamikk.specialsoftwares.in"));
assert.ok(legal.termsUrl.includes("vyaamikk.specialsoftwares.in"));
assert.ok(legal.supportEmail.includes("support.vyd@specialsoftwares.com"));
assert.ok(!/example\.com/i.test(legal.supportEmail));
assert.ok(!legal.legalHubUrl.includes("/legal"), "legal hub must not use missing /legal route");
assert.ok(!legal.privacyUrl.includes("/auth"), "privacy must not use /auth");
assert.ok(!legal.termsUrl.includes("/auth"), "terms must not use /auth");

const blockers = findLegalConfigBlockers().filter((b) => /example\.com|\.example/i.test(b));
assert.equal(blockers.length, 0, `Unexpected URL blockers: ${blockers.join(", ")}`);

console.log("legalConsent.test.ts OK");
