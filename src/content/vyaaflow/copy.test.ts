import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STATUTORY_INFO_REGISTRY } from "@/services/statutory/statutoryInfoRegistry";
import { vyaaflowCopy, vyaaflowCopyKeyPaths } from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

assert.equal(
  vyaaflowCopy.paragraphs.businessDates,
  "Vyaamikk Diary keeps your business dates in one place. Records, dues, follow-ups and reminders appear in Important Business Dates, helping you review what happened and what is coming up."
);
assert.equal(
  vyaaflowCopy.paragraphs.statutory,
  "Statutory reminders show standard GST, income-tax, TDS/TCS and LLP due dates for reference. They are informational only. Check applicability and the final date on the official portal or with your CA, CS or tax professional."
);
assert.equal(
  vyaaflowCopy.paragraphs.businessPins,
  "Business PINs organises freight and dispatch records by their From and To PIN codes. Locations represent approximate postal areas, not live tracking."
);
assert.equal(vyaaflowCopy.screenTitle, "VyaaFlow");
assert.equal(vyaaflowCopy.calendarSection, "Important Business Dates");
assert.equal(vyaaflowCopy.mapSection, "Business PINs");

const categories = [...new Set(STATUTORY_INFO_REGISTRY.map((template) => template.category))].sort();
assert.deepEqual(categories, ["GST", "IncomeTax", "LLP", "TDS_TCS"]);

const calendarService = readFileSync(
  join(root, "src/services/calendarMaps/calendarMapsService.ts"),
  "utf8"
);
assert.match(calendarService, /statutoryItemsToMapRecords/);
assert.match(calendarService, /e\.reminder/);
assert.match(calendarService, /dueDate/);
assert.match(calendarService, /categoryKey: "statutory"/);

const calendarScreen = readFileSync(join(root, "app/(app)/(tabs)/calendar.tsx"), "utf8");
assert.match(calendarScreen, /vyaaflowCopy\.calendarSection/);
assert.match(calendarScreen, /vyaaflowCopy\.mapSection/);
assert.match(calendarScreen, /VyaaFlowIntro/);
assert.doesNotMatch(calendarScreen, /allowFontScaling=\{false\}/);
assert.doesNotMatch(calendarScreen, /numberOfLines/);

function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") {
    if (prefix) out[prefix] = node;
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const enCatalog = flatten(
  JSON.parse(readFileSync(join(root, "src/i18n/locales/en.json"), "utf8")).calendarMaps.vyaaflow
);
const english = flatten(vyaaflowCopy);
for (const [key, value] of Object.entries(english)) {
  assert.equal(enCatalog[key], value, key);
}
for (const lang of ["hi", "ta", "te", "gu"]) {
  const catalog = flatten(
    JSON.parse(readFileSync(join(root, `src/i18n/locales/${lang}.json`), "utf8")).calendarMaps
      .vyaaflow
  );
  for (const key of Object.keys(english)) {
    assert.equal(typeof catalog[key], "string", `${lang} ${key}`);
    assert.ok(catalog[key].trim().length > 0, `${lang} ${key}`);
  }
  assert.notEqual(catalog["paragraphs.businessDates"], english["paragraphs.businessDates"]);
  assert.notEqual(catalog["paragraphs.statutory"], english["paragraphs.statutory"]);
  assert.notEqual(catalog["paragraphs.businessPins"], english["paragraphs.businessPins"]);
}

const keys = vyaaflowCopyKeyPaths();
for (const key of [
  "screenTitle",
  "intro",
  "showDetails",
  "hideDetails",
  "calendarSection",
  "mapSection",
  "paragraphs.businessDates",
  "paragraphs.statutory",
  "paragraphs.businessPins",
  "detectMyPin.action",
  "detectMyPin.reason",
  "detectMyPin.continue",
  "detectMyPin.notNow",
  "detectMyPin.working",
  "detectMyPin.confirmLead",
  "detectMyPin.approximateNote",
  "detectMyPin.usePin",
  "detectMyPin.typeInstead",
  "detectMyPin.denied",
  "detectMyPin.unavailable",
  "detectMyPin.keptManual",
  "pinList.empty",
  "pinList.approximate",
  "pinList.from",
  "pinList.to",
  "pinList.unplotted",
  "pinList.invalid",
  "pinList.mapNote",
  "pinList.mapEmpty",
]) {
  assert.ok(keys.includes(key), key);
}

console.log("copy.test.ts: ok");
