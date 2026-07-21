import assert from "node:assert/strict";

import { formatOtpCountdownMmSs, remainingSecondsUntil } from "./otpCountdownFormat";

assert.equal(formatOtpCountdownMmSs(30), "00:30");
assert.equal(formatOtpCountdownMmSs(29), "00:29");
assert.equal(formatOtpCountdownMmSs(0), "00:00");
assert.equal(formatOtpCountdownMmSs(872), "14:32");
assert.equal(formatOtpCountdownMmSs(-5), "00:00");

const now = 1_000_000;
assert.equal(remainingSecondsUntil(now + 30_000, now), 30);
assert.equal(remainingSecondsUntil(now + 29_100, now), 30); // ceil
assert.equal(remainingSecondsUntil(now + 100, now), 1);
assert.equal(remainingSecondsUntil(now - 1000, now), 0);

// Rerender-stable: same target → same remaining (no independent timer state).
const target = now + 15_000;
assert.equal(remainingSecondsUntil(target, now), remainingSecondsUntil(target, now));

console.log("otpCountdownFormat.test.ts: ok");
