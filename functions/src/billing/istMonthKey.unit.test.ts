/**
 * Deterministic IST month-boundary proof (owner spec §15).
 * Run: npm run test:billing-ist-month
 *
 * Proves the exact instants the owner required:
 *   2026-09-30 23:59 IST → "2026-09"
 *   2026-10-01 00:00 IST → "2026-10"
 * plus year rollover, month padding, and the fixed-offset identity that the
 * firestore.rules expression mirrors (see istMonthKey.ts header).
 */

import assert from "node:assert/strict";

import { IST_UTC_OFFSET_MS, istMonthKeyForMillis } from "./istMonthKey";

assert.equal(IST_UTC_OFFSET_MS, 19_800_000); // +05:30, no DST

// Owner-required boundary: 2026-09-30 23:59 IST == 2026-09-30T18:29:00Z.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 29, 0)), "2026-09");
// Owner-required boundary: 2026-10-01 00:00 IST == 2026-09-30T18:30:00Z.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0)), "2026-10");
// One millisecond before the boundary stays in September.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0) - 1), "2026-09");

// Year rollover: 2026-12-31 23:59:59.999 IST vs 2027-01-01 00:00 IST.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 29, 59, 999)), "2026-12");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 30, 0)), "2027-01");

// A UTC/IST divergence case: 2026-03-31T20:00Z is already 2026-04-01 01:30 IST.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 2, 31, 20, 0, 0)), "2026-04");

// Zero-padding for single-digit months; no padding regression for >= 10.
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 3, 15)), "2026-04");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 10, 15)), "2026-11");

// Formula identity with the rules expression: shifting by the fixed offset
// then reading UTC fields must match reading Asia/Kolkata wall-clock fields.
const probe = Date.UTC(2026, 8, 12, 10, 33, 0);
const viaFormula = istMonthKeyForMillis(probe);
const intl = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
}).format(new Date(probe)); // "YYYY-MM"
assert.equal(viaFormula, intl);

console.log("istMonthKey.unit.test.ts: ok");
