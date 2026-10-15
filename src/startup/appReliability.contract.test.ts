/**
 * SOURCE contracts for the three app-reliability corrections.
 * Not a mounted React test and not native-device acceptance.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isPlottableCoordinate } from "@/services/calendarMaps/mapClustering";
import {
  mapMarkerWorkAllowed,
  mayMountNativeMapView,
} from "@/services/maps/mapNativeConfig";
import {
  startupResultMayPublish,
  startupRetryMayStart,
} from "@/startup/startupAttempt";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

assert.equal(startupRetryMayStart(true), false);
assert.equal(startupRetryMayStart(false), true);
assert.equal(startupResultMayPublish(1, 2), false);
assert.equal(startupResultMayPublish(4, 4), true);

assert.equal(mapMarkerWorkAllowed({ mode: "map", nativeMapMayMount: false }), false);
assert.equal(mapMarkerWorkAllowed({ mode: "calendar", nativeMapMayMount: true }), false);
assert.equal(mapMarkerWorkAllowed({ mode: "map", nativeMapMayMount: true }), true);
assert.equal(mayMountNativeMapView({ platform: "android", androidMapsConfigured: false }), false);
assert.equal(mayMountNativeMapView({ platform: "android", androidMapsConfigured: true }), true);
assert.equal(isPlottableCoordinate(22.5, 78.1), true);
assert.equal(isPlottableCoordinate(91, 0), false);
assert.equal(isPlottableCoordinate(Number.NaN, 10), false);

const deferred = readFileSync(
  join(root, "src/components/calendarMaps/DeferredCalendarMapsMapPanel.tsx"),
  "utf8"
);
const calendar = readFileSync(join(root, "app/(app)/(tabs)/calendar.tsx"), "utf8");
const you = readFileSync(join(root, "app/(app)/(tabs)/you.tsx"), "utf8");
const en = readFileSync(join(root, "src/i18n/locales/en.json"), "utf8");

assert.doesNotMatch(deferred, /from ["']react-native-maps["']/);
assert.match(deferred, /if \(!canMount\)/);
assert.match(deferred, /calendarMaps\.map\.unavailableTitle/);
assert.match(deferred, /calendarMaps\.map\.unavailableBody/);
assert.match(deferred, /calendarMaps\.map\.backToCalendar/);
assert.doesNotMatch(deferred, /unavailableConfig/);
assert.doesNotMatch(deferred, /minHeight:\s*280/);
assert.doesNotMatch(calendar, /mapMarkerWorkAllowed/);
assert.doesNotMatch(calendar, /onBackToCalendar/);
assert.doesNotMatch(calendar, /DeferredCalendarMapsMapPanel/);
assert.match(calendar, /navigateToCalendarMapRecord/);
assert.match(calendar, /vyaaflowVisibleMode/);
assert.match(en, /Map is unavailable in this version\./);
assert.match(en, /Saved From and To PINs stay in the list\./);
assert.doesNotMatch(en, /Android maps key is not configured/);
assert.doesNotMatch(en, /Your records stay on this device/);
assert.doesNotMatch(you, /allowFontScaling=\{false\}/);

console.log("appReliability.contract.test.ts: ok (SOURCE)");
