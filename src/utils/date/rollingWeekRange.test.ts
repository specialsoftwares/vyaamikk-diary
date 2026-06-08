import assert from "node:assert/strict";
import { startOfDay } from "date-fns";

import { formatRollingWeekRange } from "./rollingWeekRange";

const june1 = startOfDay(new Date(2026, 5, 1)).getTime();
const june7 = startOfDay(new Date(2026, 5, 7)).getTime();
const may30 = startOfDay(new Date(2026, 4, 30)).getTime();
const jun6 = startOfDay(new Date(2026, 5, 6)).getTime();
const dec30 = startOfDay(new Date(2025, 11, 30)).getTime();
const jan5 = startOfDay(new Date(2026, 0, 5)).getTime();

assert.equal(
  formatRollingWeekRange(june1, june7, "en"),
  "1 Jun – 7 Jun 2026"
);
assert.equal(
  formatRollingWeekRange(may30, jun6, "en"),
  "30 May – 6 Jun 2026"
);
assert.equal(
  formatRollingWeekRange(dec30, jan5, "en"),
  "30 Dec 2025 – 5 Jan 2026"
);

console.log("rollingWeekRange.test.ts: all assertions passed");
