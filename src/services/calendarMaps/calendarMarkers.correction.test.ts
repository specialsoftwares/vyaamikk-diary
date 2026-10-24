import assert from "node:assert/strict";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { dayKey } from "@/utils/date";

import {
  buildOccurrenceMarks,
  fixtureTouchesDay,
} from "./calendarOccurrenceMarks";

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

const entry = {
  id: "fixture-payment",
  entryType: "payment_request",
  entryDate: local(2026, 10, 17),
  reminder: { at: local(2026, 10, 20), leadDays: 1 },
  payload: { dueDate: local(2026, 10, 24) },
  title: "Fixture payment",
  deletedAt: null,
} as unknown as BusinessEntry;

const pack = {
  id: "fixture-pack",
  matterDate: local(2026, 10, 17),
  dueDate: local(2026, 10, 24),
  reminder: { at: local(2026, 10, 22) },
  title: "Fixture pack",
  deletedAt: null,
} as unknown as ProfessionalServicePack;

const marked = buildOccurrenceMarks({
  entries: [entry],
  packs: [pack],
  letterheadDocs: [],
});
const due = dayKey(local(2026, 10, 24));
assert.equal(marked[dayKey(local(2026, 10, 17))]?.entry, true);
assert.equal(marked[dayKey(local(2026, 10, 17))]?.pack, true);
assert.equal(marked[dayKey(local(2026, 10, 20))]?.followUp, true);
assert.equal(marked[due]?.followUp, true);
assert.notEqual(marked[due]?.entry, true);

const touch = fixtureTouchesDay(entry, pack, null, due);
assert.equal(touch.entry, true);
assert.equal(touch.pack, true);
assert.equal(touch.entry && entry.id === "fixture-payment", true);
assert.equal(touch.pack && pack.id === "fixture-pack", true);

console.log("calendarMarkers.correction.test.ts: ok");
