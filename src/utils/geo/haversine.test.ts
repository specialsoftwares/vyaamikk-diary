import assert from "node:assert/strict";

import { haversineDistanceKm } from "./haversine";

// Delhi (~28.61, 77.21) to Mumbai (~19.08, 72.88) — roughly 1,150 km straight-line
const delhiMumbai = haversineDistanceKm(28.6139, 77.209, 19.076, 72.8777);
assert.ok(delhiMumbai != null && delhiMumbai > 1000 && delhiMumbai < 1300);

// Same point → ~0 km
assert.equal(haversineDistanceKm(12.97, 77.59, 12.97, 77.59), 0);

// Invalid inputs
assert.equal(haversineDistanceKm(Number.NaN, 0, 0, 0), null);

console.log("haversine.test.ts: ok");
