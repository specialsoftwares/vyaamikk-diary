import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { IST_UTC_OFFSET_MS, istMonthKeyForMillis, isIstMonthKeyShape } from "./istMonthKey";

assert.equal(IST_UTC_OFFSET_MS, 19_800_000);
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 29, 0)), "2026-09");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0)), "2026-10");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0) - 1), "2026-09");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 29, 59, 999)), "2026-12");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 30, 0)), "2027-01");
assert.equal(isIstMonthKeyShape("2026-09"), true);
assert.equal(isIstMonthKeyShape("garbage"), false);
assert.equal(isIstMonthKeyShape("2026-9"), false);

const app = readFileSync(resolve(process.cwd(), "src/billing/istMonthKey.ts"), "utf8");
const fn = readFileSync(resolve(process.cwd(), "functions/src/billing/istMonthKey.ts"), "utf8");
assert.match(app, /IST_UTC_OFFSET_MS = 19_800_000/);
assert.match(fn, /IST_UTC_OFFSET_MS = 19_800_000/);
assert.match(app, /utcMillis \+ IST_UTC_OFFSET_MS/);
assert.match(fn, /utcMillis \+ IST_UTC_OFFSET_MS/);

console.log("istMonthKey.test.ts: ok");
