import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const deferred = read("src/components/calendarMaps/DeferredCalendarMapsMapPanel.tsx");
const mapPanel = read("src/components/calendarMaps/CalendarMapsMapPanel.tsx");
const hook = read("src/hooks/useCalendarMapsData.ts");
const markers = read("src/services/calendarMaps/mapMarkerRecords.ts");
const postal = read("src/components/composer/PostalLocationSection.tsx");
const pinHook = read("src/hooks/useIndianPincodeField.ts");
const composer = read("app/(app)/composer/[type].tsx");
const diary = read("app/(app)/diary/edit/[id].tsx");
const action = read("src/components/composer/DetectMyPinAction.tsx");

assert.doesNotMatch(deferred, /from ["']react-native-maps["']/);
assert.match(deferred, /if \(!canMount\)/);
assert.match(deferred, /calendarMaps\.map\.unavailableTitle/);
assert.match(deferred, /calendarMaps\.map\.unavailableBody/);
assert.match(deferred, /calendarMaps\.map\.backToCalendar/);
assert.doesNotMatch(deferred, /unavailableConfig/);
assert.doesNotMatch(deferred, /minHeight:\s*280/);
assert.match(deferred, /BusinessPinRecordList/);

assert.doesNotMatch(mapPanel, /Polyline/);
assert.doesNotMatch(mapPanel, /showsUserLocation=\{true\}/);
assert.doesNotMatch(mapPanel, /location-footprints/);
assert.match(mapPanel, /showsUserLocation=\{false\}/);
assert.match(mapPanel, /vyaaflowCopy\.pinList\.mapNote/);

assert.match(hook, /sourceUserRef/);
assert.match(hook, /userIdRef\.current !== owner/);
assert.match(hook, /pinListActive/);
assert.match(hook, /buildBusinessPinGroupsSync/);
assert.doesNotMatch(hook, /locationService/);

assert.match(markers, /if \(!isDbReady\(\)\)/);
assert.match(markers, /group\.valid/);
assert.doesNotMatch(markers, /Promise\.all\(\s*\[\.\.\.pins\]/);

assert.match(postal, /DetectMyPinAction/);
assert.match(postal, /fieldRevisionRef\.current \+= 1/);
assert.match(postal, /acceptExternalPin/);
assert.match(pinHook, /userEditedRef\.current = false/);
assert.match(pinHook, /if \(requestIdRef\.current !== id\) return/);

assert.match(composer, /preserveAlreadySavedLocation/);
assert.match(diary, /preserveAlreadySavedLocation/);
assert.match(action, /detectMyPinOnDevice/);
assert.match(action, /vyaaflowCopy\.detectMyPin\.reason/);
assert.doesNotMatch(action, /watchPositionAsync/);
assert.doesNotMatch(action, /requestBackgroundPermissionsAsync/);

const showReasonFn = action.slice(action.indexOf("const showReason"), action.indexOf("const dismiss"));
assert.doesNotMatch(showReasonFn, /detectMyPinOnDevice/);
const continueFn = action.slice(action.indexOf("const continueDetect"), action.indexOf("const usePin"));
assert.match(continueFn, /detectMyPinOnDevice/);
assert.match(continueFn, /acceptDetectPinTap/);

console.log("vyaaflowScreen.contract.test.ts: ok");
