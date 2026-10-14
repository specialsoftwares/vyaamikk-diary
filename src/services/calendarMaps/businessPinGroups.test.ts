import assert from "node:assert/strict";

import {
  applyPinCentroids,
  groupFreightPinRows,
  lookupPinCentroidsBounded,
  PIN_LOOKUP_CONCURRENCY,
  type FreightPinRow,
} from "./businessPinGroups";

function row(overrides: Partial<FreightPinRow> = {}): FreightPinRow {
  return {
    entryId: "e1",
    recordKey: "e1-from",
    pinCode: "110001",
    side: "from",
    valid: true,
    areaLabel: "New Delhi · 110001",
    ...overrides,
  };
}

const grouped = groupFreightPinRows([
  { row: row(), record: "dispatch-a" },
  { row: row({ entryId: "e2", recordKey: "e2-from" }), record: "dispatch-b" },
  { row: row({ entryId: "e1", recordKey: "e1-from" }), record: "duplicate" },
  {
    row: row({ entryId: "e1", recordKey: "e1-to", side: "to", pinCode: "110001" }),
    record: "dispatch-a-to",
  },
  {
    row: row({
      entryId: "e3",
      recordKey: "e3-from",
      pinCode: "12",
      side: "from",
      valid: false,
      areaLabel: "12",
    }),
    record: "bad",
  },
]);

assert.equal(grouped.length, 3);
const fromGroup = grouped.find((group) => group.side === "from" && group.valid);
const toGroup = grouped.find((group) => group.side === "to");
const invalid = grouped.find((group) => !group.valid);
assert.deepEqual(fromGroup?.records, ["dispatch-a", "dispatch-b"]);
assert.deepEqual(toGroup?.records, ["dispatch-a-to"]);
assert.equal(fromGroup?.id, "from:110001");
assert.equal(toGroup?.id, "to:110001");
assert.equal(invalid?.records[0], "bad");
assert.notEqual(fromGroup?.id, toGroup?.id);

const plotted = applyPinCentroids(grouped, new Map([["110001", { latitude: 28.6, longitude: 77.2 }]]));
assert.equal(plotted.find((group) => group.side === "from" && group.valid)?.latitude, 28.6);
assert.equal(plotted.find((group) => group.side === "to")?.latitude, 28.6);
assert.equal(plotted.find((group) => !group.valid)?.latitude, null);

const missing = applyPinCentroids(grouped, new Map([["110001", null]]));
assert.equal(missing.find((group) => group.valid && group.side === "from")?.latitude, null);
assert.deepEqual(missing.find((group) => group.valid && group.side === "from")?.records, [
  "dispatch-a",
  "dispatch-b",
]);

async function main(): Promise<void> {
let active = 0;
let maxActive = 0;
const pins = Array.from({ length: 9 }, (_, index) => `11000${index}`);
const lookedUp: string[] = [];
await lookupPinCentroidsBounded(
  [...pins, pins[0]],
  async (pin) => {
    lookedUp.push(pin);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    if (pin === "110000") throw new Error("offline");
    if (pin === "110001") return { latitude: Number.NaN, longitude: 1 };
    return { latitude: 20, longitude: 78 };
  },
  PIN_LOOKUP_CONCURRENCY
);
assert.equal(maxActive, PIN_LOOKUP_CONCURRENCY);
assert.equal(lookedUp.length, pins.length);
assert.equal(lookedUp.filter((pin) => pin === pins[0]).length, 1);

console.log("businessPinGroups.test.ts: ok");
}

void main();
