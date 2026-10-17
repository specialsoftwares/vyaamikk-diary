import assert from "node:assert/strict";

import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { buildAtAGlanceView } from "@/services/dashboard/atAGlanceService";
import { buildYouDashboardSummary } from "@/services/dashboard/youDashboardSummary";
import { nextCalendarBoundary } from "@/services/dashboard/upcomingEligibility";

const now = new Date(2026, 9, 17, 15, 30).getTime();
const futureDue = new Date(2026, 9, 24, 12).getTime();
const overdueDue = new Date(2026, 9, 1, 12).getTime();

function credit(id: string, dueDate: number, status = "active"): CustomerCreditRecord {
  return {
    id,
    customerName: "Fixture customer",
    deletedAt: null,
    status,
    mode: "shop_credit",
    shopFollowUpRequired: true,
    products: [],
    payments: [],
    schedule: [{ dueDate, amount: 100 }],
    totalPayable: 100,
    saleAmount: 100,
    downPayment: 0,
  } as unknown as CustomerCreditRecord;
}

const credits = [credit("future-credit", futureDue), credit("overdue-credit", overdueDue)];
const summary = buildYouDashboardSummary([], [], [], (key) => key, now, credits);
const detail = buildAtAGlanceView(
  "upcoming",
  { entries: [], letterheadDocs: [], packs: [], creditRecords: credits },
  (key) => key,
  now
);

assert.equal(summary.stats.upcoming, 1);
assert.equal(detail.totalItems, summary.stats.upcoming);
assert.equal(
  detail.sections.some((section) => section.data.some((item) => item.id.includes("future-credit"))),
  true
);
assert.equal(
  detail.sections
    .filter((section) => section.sectionKey !== "overdue")
    .some((section) => section.data.some((item) => item.id.includes("overdue-credit"))),
  false
);

const cancelled = credit("cancelled-credit", futureDue, "cancelled");
const withCancelled = buildYouDashboardSummary([], [], [], (key) => key, now, [...credits, cancelled]);
const detailCancelled = buildAtAGlanceView(
  "upcoming",
  { entries: [], letterheadDocs: [], packs: [], creditRecords: [...credits, cancelled] },
  (key) => key,
  now
);
assert.equal(withCancelled.stats.upcoming, detailCancelled.totalItems);
assert.equal(withCancelled.stats.upcoming, 1);

const justBeforeMidnight = new Date(2026, 9, 17, 23, 59).getTime();
const midnight = new Date(2026, 9, 18, 0, 0).getTime();
assert.equal(nextCalendarBoundary(justBeforeMidnight), midnight);
assert.equal(nextCalendarBoundary(midnight), new Date(2026, 9, 19, 0, 0).getTime());

console.log("upcomingCredit.correction.test.ts: ok");
