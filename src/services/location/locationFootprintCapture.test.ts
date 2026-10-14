import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  preserveAlreadySavedLocation,
  resolveEntryLocationWithFootprint,
} from "./locationFootprintCapture";

async function main(): Promise<void> {
const saved = await resolveEntryLocationWithFootprint("user-1", {
  name: "Godown",
  geo: { latitude: 1, longitude: 2, accuracy: 5, capturedAt: 9 },
  gps: {
    latitude: 1,
    longitude: 2,
    accuracy: 5,
    capturedAt: "2026-01-01T00:00:00.000Z",
    source: "device",
  },
});
assert.equal(saved.footprintAttached, false);
assert.equal(saved.footprintFailed, false);
assert.equal(saved.location?.name, "Godown");
assert.equal(saved.location?.gps?.latitude, 1);

const fresh = await resolveEntryLocationWithFootprint("user-1", { name: "Site", geo: null, gps: null });
assert.equal(fresh.location?.gps, null);
assert.equal(fresh.footprintAttached, false);

const kept = preserveAlreadySavedLocation(saved.location, { name: "Renamed site", geo: null, gps: null });
assert.equal(kept?.name, "Renamed site");
assert.equal(kept?.gps?.latitude, 1);
assert.equal(kept?.geo?.latitude, 1);

const clearedName = preserveAlreadySavedLocation(saved.location, null);
assert.equal(clearedName?.gps?.latitude, 1);

const noPrior = preserveAlreadySavedLocation(null, { name: "Only text", geo: null, gps: null });
assert.equal(noPrior?.gps, null);

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "locationFootprintCapture.ts"), "utf8");
assert.doesNotMatch(src, /getCurrent\(/);
assert.doesNotMatch(src, /requestBackgroundPermissionsAsync/);
assert.doesNotMatch(src, /watchPositionAsync/);
assert.doesNotMatch(src, /locationFootprintsEnabled:\s*true/);

const device = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "detectMyPinDevice.ts"), "utf8");
assert.doesNotMatch(device, /requestBackgroundPermissionsAsync/);
assert.doesNotMatch(device, /watchPositionAsync/);
assert.doesNotMatch(device, /locationFootprint/);
assert.match(device, /reverseGeocodeAsync\(\{\s*latitude: point\.latitude,\s*longitude: point\.longitude,/);

console.log("locationFootprintCapture.test.ts: ok");
}

void main();
