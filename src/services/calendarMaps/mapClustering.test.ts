import assert from "node:assert/strict";

import type { CalendarMapRecord } from "./calendarMapsTypes";
import { buildMapLocationClusters } from "./mapClustering";

function record(overrides: Partial<CalendarMapRecord>): CalendarMapRecord {
  return {
    id: "entry-1-pin-from",
    entityType: "diary_entry",
    title: "Dispatch",
    subtitle: null,
    date: "2026-10-15",
    sortMs: 1,
    categoryKey: "freight",
    categoryLabelKey: "composer.types.material_dispatched",
    iconName: "package-variant",
    target: { kind: "diary_entry", entryId: "1" },
    location: {
      latitude: 28.6,
      longitude: 77.2,
      source: "pin_approximate",
      pinCode: "110001",
      postalSide: "from",
      addressLabel: "New Delhi · 110001",
    },
    manualLocationLabel: null,
    searchableLocationText: null,
    ...overrides,
  };
}

const clusters = buildMapLocationClusters([
  record({ id: "a-from" }),
  record({ id: "b-from", target: { kind: "diary_entry", entryId: "2" } }),
  record({
    id: "a-to",
    location: {
      latitude: 28.6,
      longitude: 77.2,
      source: "pin_approximate",
      pinCode: "110001",
      postalSide: "to",
    },
  }),
  record({
    id: "c-from",
    location: {
      latitude: 28.6,
      longitude: 77.2,
      source: "pin_approximate",
      pinCode: "560001",
      postalSide: "from",
    },
  }),
  record({
    id: "gps-1",
    location: { latitude: 19.1, longitude: 72.8, source: "gps" },
  }),
  record({
    id: "gps-2",
    location: { latitude: 19.1, longitude: 72.8, source: "gps" },
  }),
]);

const from110 = clusters.find((cluster) => cluster.id === "pin:from:110001");
const to110 = clusters.find((cluster) => cluster.id === "pin:to:110001");
const from560 = clusters.find((cluster) => cluster.id === "pin:from:560001");
const gps = clusters.find((cluster) => cluster.footprintSource === "gps");

assert.equal(from110?.count, 2);
assert.equal(to110?.count, 1);
assert.equal(from560?.count, 1);
assert.equal(gps?.count, 2);
assert.notEqual(from110?.id, to110?.id);
assert.equal(clusters.some((cluster) => cluster.id.includes("route")), false);

console.log("mapClustering.test.ts: ok");
