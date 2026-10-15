import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STATUTORY_INFO_REGISTRY } from "@/services/statutory/statutoryInfoRegistry";
import { vyaaflowCopy, vyaaflowCopyKeyPaths, vyaaflowPendingLocaleKeys } from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

assert.equal(
  vyaaflowCopy.paragraphs.businessDates,
  "Vyaamikk Diary keeps your business dates in one place. Records, dues, follow-ups and reminders appear in Important Business Dates, helping you review what happened and what is coming up."
);
assert.equal(
  vyaaflowCopy.paragraphs.statutory,
  "Statutory reminders show standard GST, income-tax, TDS/TCS and LLP due dates for reference. They are informational only. Check applicability and the final date on the official portal or with your CA, CS or tax professional."
);
assert.equal(vyaaflowCopy.screenTitle, "VyaaFlow");
assert.equal(vyaaflowCopy.calendarSection, "Important Business Dates");
assert.equal(vyaaflowCopy.intro, vyaaflowCopy.introCompact);
assert.equal(
  vyaaflowCopy.introCompact,
  "Business records, dues, follow-ups and reminders."
);
assert.doesNotMatch(vyaaflowCopy.introCompact, /freight|PIN/);
assert.equal(vyaaflowCopy.filters.all, "All");
assert.equal(vyaaflowCopy.filters.myBusiness, "My business");
assert.equal(vyaaflowCopy.filters.statutory, "Statutory");
assert.equal(vyaaflowCopy.statutoryReference.title, "Statutory reference");

const pendingRelative = new Set(
  Object.values(vyaaflowPendingLocaleKeys).map((key) =>
    key.replace(/^calendarMaps\.vyaaflow\./, "")
  )
);
assert.deepEqual(
  [...pendingRelative].sort(),
  [
    "filters.all",
    "filters.myBusiness",
    "filters.statutory",
    "introCompact",
    "statutoryReference.title",
  ]
);

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
const introScreen = readFileSync(
  join(root, "src/components/calendarMaps/VyaaFlowIntro.tsx"),
  "utf8"
);
assert.match(calendarScreen, /vyaaflowCopy\.intro/);
assert.match(calendarScreen, /VyaaFlowIntro/);
assert.match(calendarScreen, /navigateToCalendarMapRecord/);
assert.match(calendarScreen, /pathname: "\/statutory"/);
assert.doesNotMatch(calendarScreen, /vyaaflowCopy\.mapSection/);
assert.doesNotMatch(calendarScreen, /DeferredCalendarMapsMapPanel/);
assert.doesNotMatch(calendarScreen, /CalendarMapsModeSwitch/);
assert.doesNotMatch(calendarScreen, /Business PINs/);
assert.doesNotMatch(calendarScreen, /allowFontScaling=\{false\}/);
assert.doesNotMatch(calendarScreen, /numberOfLines/);
assert.match(introScreen, /copy\.disclaimer/);
assert.match(introScreen, /statutoryReferenceTitle/);
assert.doesNotMatch(introScreen, /businessPins/);
assert.doesNotMatch(introScreen, /paragraphs\.businessDates/);

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
  if (pendingRelative.has(key)) {
    if (enCatalog[key] !== undefined) assert.equal(enCatalog[key], value, key);
    continue;
  }
  assert.equal(enCatalog[key], value, key);
}
for (const lang of ["hi", "ta", "te", "gu"]) {
  const catalog = flatten(
    JSON.parse(readFileSync(join(root, `src/i18n/locales/${lang}.json`), "utf8")).calendarMaps
      .vyaaflow
  );
  for (const key of Object.keys(english)) {
    if (pendingRelative.has(key)) continue;
    assert.equal(typeof catalog[key], "string", `${lang} ${key}`);
    assert.ok(catalog[key].trim().length > 0, `${lang} ${key}`);
  }
  assert.notEqual(catalog["paragraphs.businessDates"], english["paragraphs.businessDates"]);
  assert.notEqual(catalog["paragraphs.statutory"], english["paragraphs.statutory"]);
  for (const key of [
    "introCompact",
    "filters.all",
    "filters.myBusiness",
    "filters.statutory",
    "statutoryReference.title",
  ]) {
    assert.equal(typeof catalog[key], "string", `${lang} ${key}`);
    assert.notEqual(catalog[key], english[key], `${lang} ${key}`);
  }
}

const keys = vyaaflowCopyKeyPaths();
for (const key of [
  "screenTitle",
  "intro",
  "introCompact",
  "showDetails",
  "hideDetails",
  "calendarSection",
  "paragraphs.businessDates",
  "paragraphs.statutory",
  "filters.all",
  "filters.myBusiness",
  "filters.statutory",
  "statutoryReference.title",
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
]) {
  assert.ok(keys.includes(key), key);
}

console.log("copy.test.ts: ok");
