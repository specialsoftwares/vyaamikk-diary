import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { nextUsageWrite, readUsageSnapshot } from "./usageTransition";

assert.equal(readUsageSnapshot(undefined), null);

const valid = readUsageSnapshot({
  monthKey: "2026-09",
  recordsThisMonth: 4,
  lastRecordCollection: "purchaseOrders",
  lastRecordId: "po-1",
});
assert.equal(valid?.recordsThisMonth, 4);

assert.throws(
  () =>
    readUsageSnapshot({
      monthKey: "nope",
      recordsThisMonth: 4,
      lastRecordCollection: "purchaseOrders",
      lastRecordId: "po-1",
    }),
  (e: unknown) => e instanceof AppError && e.code === "quota_state_invalid"
);

assert.throws(
  () =>
    readUsageSnapshot({
      monthKey: "2026-09",
      recordsThisMonth: 4.5,
      lastRecordCollection: "purchaseOrders",
      lastRecordId: "po-1",
    }),
  (e: unknown) => e instanceof AppError && e.code === "quota_state_invalid"
);

const first = nextUsageWrite({
  existing: null,
  monthKey: "2026-09",
  cap: 25,
  collection: "purchaseOrders",
  recordId: "po-1",
  updatedAt: 1,
});
assert.equal(first.recordsThisMonth, 1);

const inc = nextUsageWrite({
  existing: valid,
  monthKey: "2026-09",
  cap: 25,
  collection: "purchaseOrders",
  recordId: "po-2",
  updatedAt: 1,
});
assert.equal(inc.recordsThisMonth, 5);

const roll = nextUsageWrite({
  existing: valid,
  monthKey: "2026-10",
  cap: 25,
  collection: "customerCreditRecords",
  recordId: "cr-1",
  updatedAt: 1,
});
assert.equal(roll.recordsThisMonth, 1);
assert.equal(roll.lastRecordCollection, "customerCreditRecords");

assert.throws(
  () =>
    nextUsageWrite({
      existing: {
        monthKey: "2026-09",
        recordsThisMonth: 25,
        lastRecordCollection: "purchaseOrders",
        lastRecordId: "po-x",
      },
      monthKey: "2026-09",
      cap: 25,
      collection: "purchaseOrders",
      recordId: "po-y",
      updatedAt: 1,
    }),
  (e: unknown) => e instanceof AppError && e.code === "quota_exhausted"
);

const unlimited = nextUsageWrite({
  existing: {
    monthKey: "2026-09",
    recordsThisMonth: 500,
    lastRecordCollection: "professionalPacks",
    lastRecordId: "p-1",
  },
  monthKey: "2026-09",
  cap: -1,
  collection: "professionalPacks",
  recordId: "p-2",
  updatedAt: 1,
});
assert.equal(unlimited.recordsThisMonth, 501);

const diaryInc = nextUsageWrite({
  existing: valid,
  monthKey: "2026-09",
  cap: 25,
  collection: "entries",
  recordId: "en-1",
  updatedAt: 1,
});
assert.equal(diaryInc.lastRecordCollection, "entries");
assert.equal(diaryInc.lastRecordId, "en-1");
assert.equal(diaryInc.recordsThisMonth, 5);

console.log("usageTransition.test.ts: ok");
