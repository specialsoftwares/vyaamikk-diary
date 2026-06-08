import assert from "node:assert/strict";

import { findLegalConfigBlockers, legal } from "../../config/legal";

assert.ok(legal.privacyUrl.includes("vyaamikk.specialsoftwares.in"));
assert.ok(legal.termsUrl.includes("vyaamikk.specialsoftwares.in"));
assert.ok(!/example\.com/i.test(legal.supportEmail));

const blockers = findLegalConfigBlockers().filter((b) => /example\.com|\.example/i.test(b));
assert.equal(blockers.length, 0, `Unexpected URL blockers: ${blockers.join(", ")}`);

console.log("legalConsent.test.ts OK");
