import assert from "node:assert/strict";

import type { CalendarMapRecord, CalendarMapSection } from "@/services/calendarMaps";

import {
  filterVyaaflowAgendaSections,
  vyaaflowVisibleMode,
} from "./vyaaflowAgenda";

function record(overrides: Partial<CalendarMapRecord> & Pick<CalendarMapRecord, "id" | "categoryKey">): CalendarMapRecord {
  return {
    entityType: "diary_entry",
    title: overrides.id,
    subtitle: null,
    date: "2026-10-15",
    sortMs: 1,
    categoryLabelKey: "composer.types.work_note",
    iconName: "briefcase-outline",
    target: { kind: "diary_entry", entryId: overrides.id },
    location: null,
    manualLocationLabel: null,
    searchableLocationText: null,
    ...overrides,
  };
}

function statutory(
  id: string,
  templateId: string,
  occurrenceId: string
): CalendarMapRecord {
  return record({
    id,
    entityType: "statutory_info",
    categoryKey: "statutory",
    categoryLabelKey: "statutory.calendar.section",
    target: { kind: "statutory_info", occurrenceId, templateId },
  });
}

const business = record({ id: "work-1", categoryKey: "work" });
const gst = statutory("stat-gst-7", "gst-3b", "occ-7");
const gstAgain = statutory("stat-gst-1", "gst-3b", "occ-1");
const tds = statutory("stat-tds", "tds-q", "occ-tds");

const sections: CalendarMapSection[] = [
  { categoryKey: "work", data: [business] },
  { categoryKey: "statutory", data: [gst, gstAgain, tds] },
];

const all = filterVyaaflowAgendaSections(sections, "all");
assert.deepEqual(
  all.map((section) => [section.categoryKey, section.data.map((item) => item.id)]),
  [
    ["work", ["work-1"]],
    ["statutory", ["stat-gst-7", "stat-tds"]],
  ]
);

const mine = filterVyaaflowAgendaSections(sections, "business");
assert.deepEqual(mine.map((section) => section.categoryKey), ["work"]);
assert.equal(mine.some((section) => section.data.some((item) => item.entityType === "statutory_info")), false);

const onlyStatutory = filterVyaaflowAgendaSections(sections, "statutory");
assert.deepEqual(onlyStatutory.map((section) => section.categoryKey), ["statutory"]);
assert.deepEqual(
  onlyStatutory[0]?.data.map((item) => item.id),
  ["stat-gst-7", "stat-tds"]
);

const alreadyListed = filterVyaaflowAgendaSections(
  [
    {
      categoryKey: "reminders",
      data: [statutory("stat-in-agenda", "gst-3b", "occ-agenda")],
    },
    { categoryKey: "statutory", data: [gst] },
  ],
  "all"
);
assert.deepEqual(
  alreadyListed.flatMap((section) => section.data.map((item) => item.id)),
  ["stat-in-agenda"]
);

assert.equal(vyaaflowVisibleMode("map"), "calendar");
assert.equal(vyaaflowVisibleMode(["map"]), "calendar");
assert.equal(vyaaflowVisibleMode("calendar"), "calendar");
assert.equal(vyaaflowVisibleMode(undefined), "calendar");

console.log("vyaaflowAgenda.test.ts: ok");
