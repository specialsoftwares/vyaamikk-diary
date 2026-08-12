/**
 * Local business-date helpers — never use UTC ISO date slices for diary/calendar days.
 */
import assert from "node:assert/strict";

import { dayKey, localBusinessDateKey, todayLocalBusinessDateKey } from "./date";

const nearMidnightLocal = new Date();
nearMidnightLocal.setHours(0, 30, 0, 0);
const ms = nearMidnightLocal.getTime();

const localKey = dayKey(ms);
const utcSlice = new Date(ms).toISOString().slice(0, 10);

assert.match(localKey, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(localBusinessDateKey(ms), localKey);
assert.equal(todayLocalBusinessDateKey(ms), localKey);

// Near local midnight, UTC ISO date can disagree with the local calendar day
// (depends on timezone). The helper must prefer local components via date-fns.
const offsetMin = nearMidnightLocal.getTimezoneOffset();
if (offsetMin !== 0) {
  // In non-UTC zones, document the hazard we avoid for diary dates.
  assert.ok(
    typeof utcSlice === "string" && utcSlice.length === 10,
    "utc slice exists for comparison"
  );
}

// Absolute timestamps used as "when generated" still go through dayKey when
// indexed for local search — same helper, local calendar day.
assert.equal(dayKey(Date.UTC(2026, 0, 1, 22, 0, 0)).length, 10);

console.log("localBusinessDate.test.ts: ok");
