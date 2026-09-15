import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { IST_UTC_OFFSET_MS, istMonthKeyForMillis, isIstMonthKeyShape } from "./istMonthKey";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const appSrc = readFileSync(join(root, "src/billing/istMonthKey.ts"), "utf8");
const fnSrc = readFileSync(join(root, "functions/src/billing/istMonthKey.ts"), "utf8");

assert.match(appSrc, /IST_UTC_OFFSET_MS = 19_800_000/);
assert.match(fnSrc, /IST_UTC_OFFSET_MS = 19_800_000/);
assert.match(appSrc, /utcMillis \+ IST_UTC_OFFSET_MS/);
assert.match(fnSrc, /utcMillis \+ IST_UTC_OFFSET_MS/);
assert.equal(IST_UTC_OFFSET_MS, 19_800_000);

assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 29, 0)), "2026-09");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0)), "2026-10");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 8, 30, 18, 30, 0) - 1), "2026-09");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 29, 59, 999)), "2026-12");
assert.equal(istMonthKeyForMillis(Date.UTC(2026, 11, 31, 18, 30, 0)), "2027-01");

assert.equal(isIstMonthKeyShape("2026-09"), true);
assert.equal(isIstMonthKeyShape("2026-9"), false);
assert.equal(isIstMonthKeyShape("garbage"), false);
assert.equal(isIstMonthKeyShape(1), false);

console.log("istMonthKey.contract.test.ts: ok");
