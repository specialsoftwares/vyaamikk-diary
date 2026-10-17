import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

for (const gone of [
  "src/components/calendarMaps/DeferredCalendarMapsMapPanel.tsx",
  "src/components/calendarMaps/CalendarMapsMapPanel.tsx",
  "src/components/calendarMaps/FreightDispatchMapIntelView.tsx",
  "src/services/calendarMaps/mapMarkerRecords.ts",
  "src/services/maps/mapNativeConfig.ts",
]) {
  assert.equal(existsSync(join(root, gone)), false, gone);
}

const hook = read("src/hooks/useCalendarMapsData.ts");
const calendar = read("app/(app)/(tabs)/calendar.tsx");
const modeSwitch = read("src/components/calendarMaps/CalendarMapsModeSwitch.tsx");
const recordRow = read("src/components/calendarMaps/CalendarMapRecordRow.tsx");
const postal = read("src/components/composer/PostalLocationSection.tsx");
const pinHook = read("src/hooks/useIndianPincodeField.ts");
const composer = read("app/(app)/composer/[type].tsx");
const diary = read("app/(app)/diary/edit/[id].tsx");
const action = read("src/components/composer/DetectMyPinAction.tsx");

assert.doesNotMatch(recordRow, /FreightDispatchMapIntelView/);
assert.doesNotMatch(recordRow, /react-native-maps/);

assert.match(hook, /sourceUserRef/);
assert.match(hook, /userIdRef\.current !== owner/);
assert.match(hook, /buildStatutoryCalendarView/);
assert.doesNotMatch(hook, /buildStatutoryTabViewModel/);
assert.match(hook, /mergeStatutoryCalendarMarkers/);
assert.match(hook, /buildCalendarDayView/);
assert.doesNotMatch(hook, /pinListActive/);
assert.doesNotMatch(hook, /buildBusinessPinGroupsSync/);
assert.doesNotMatch(hook, /buildGpsMapMarkersSync/);
assert.doesNotMatch(hook, /buildMapLocationClusters/);
assert.doesNotMatch(hook, /scheduleDeferredIndiaPincodeWarm/);
assert.doesNotMatch(hook, /mapActive/);
assert.doesNotMatch(hook, /locationService/);

assert.doesNotMatch(calendar, /DeferredCalendarMapsMapPanel/);
assert.doesNotMatch(calendar, /CalendarMapsMapPanel/);
assert.doesNotMatch(calendar, /CalendarMapsModeSwitch/);
assert.doesNotMatch(calendar, /CalendarMapsModeTransition/);
assert.doesNotMatch(calendar, /mapEverOpened/);
assert.doesNotMatch(calendar, /mayMountNativeMapView/);
assert.doesNotMatch(calendar, /readAndroidMapsConfigured/);
assert.doesNotMatch(calendar, /mapMarkerWorkAllowed/);
assert.doesNotMatch(calendar, /Business PINs/);
assert.doesNotMatch(calendar, /pinListActive/);
assert.match(calendar, /navigateToCalendarMapRecord/);
assert.match(calendar, /vyaaflowVisibleMode/);
assert.match(calendar, /filterVyaaflowAgendaSections/);
assert.match(calendar, /pathname: "\/statutory"/);
assert.doesNotMatch(calendar, /overdue/i);
assert.doesNotMatch(modeSwitch, /select\("map"\)/);
assert.doesNotMatch(modeSwitch, /mapLabel/);

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
