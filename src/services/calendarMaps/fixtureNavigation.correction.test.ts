import assert from "node:assert/strict";

import type { Router } from "expo-router";

import { navigateToCalendarMapRecord } from "./calendarMapsRouting";
import type { CalendarMapRecord } from "./calendarMapsTypes";

const pushes: unknown[] = [];
const router = {
  push: (href: unknown) => {
    pushes.push(href);
  },
} as unknown as Router;

const record = {
  id: "fixture-payment",
  entityType: "diary_entry",
  title: "Fixture payment",
  subtitle: null,
  date: "2026-10-24",
  sortMs: 1,
  categoryKey: "payments",
  categoryLabelKey: "calendar.payments",
  iconName: "cash",
  target: { kind: "diary_entry", entryId: "fixture-payment" },
  location: null,
  manualLocationLabel: null,
  searchableLocationText: null,
} as CalendarMapRecord;

navigateToCalendarMapRecord(router, record);
assert.deepEqual(pushes[0], {
  pathname: "/(app)/diary/[id]",
  params: { id: "fixture-payment", from: "calendar" },
});

navigateToCalendarMapRecord(router, {
  ...record,
  id: "fixture-pack",
  target: { kind: "professional_pack", packId: "fixture-pack" },
});
assert.deepEqual(pushes[1], {
  pathname: "/(app)/professional-pack/[id]",
  params: { id: "fixture-pack" },
});

console.log("fixtureNavigation.correction.test.ts: ok");
