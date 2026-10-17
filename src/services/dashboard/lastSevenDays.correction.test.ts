import assert from "node:assert/strict";

import type { BusinessEntry } from "@/domain/businessEntry";
import {
  buildYouDashboardSummary,
  lastSevenDayBounds,
} from "@/services/dashboard/youDashboardSummary";

const now = new Date(2026, 9, 17, 15).getTime();
const bounds = lastSevenDayBounds(now);
assert.equal(bounds.endMs > bounds.startMs, true);

const inRange = new Date(2026, 9, 12, 12).getTime();
const future = new Date(2026, 9, 20, 12).getTime();
const summary = buildYouDashboardSummary(
  [
    {
      id: "in-range",
      entryDate: inRange,
      title: "In range",
      entryType: "work_update_issue",
      updatedAt: inRange,
      source: "composer",
      payload: {},
      deletedAt: null,
    },
    {
      id: "future",
      entryDate: future,
      title: "Future",
      entryType: "work_update_issue",
      updatedAt: future,
      source: "composer",
      payload: {},
      reminder: { at: future, leadDays: 1 },
      deletedAt: null,
    },
  ] as unknown as BusinessEntry[],
  [],
  [],
  (key) => key,
  now
);

assert.equal(summary.stats.thisWeek, 1);
assert.equal(summary.stats.today, 0);
assert.equal(summary.stats.upcoming, 1);
console.log("lastSevenDays.correction.test.ts: ok");
