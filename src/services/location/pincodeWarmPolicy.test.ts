import assert from "node:assert/strict";

import {
  shouldQueryOfflinePincodeOnInteractivePath,
  shouldWarmIndiaPincodeOnCalendarTabMount,
} from "./pincodeWarmPolicy";

assert.equal(
  shouldWarmIndiaPincodeOnCalendarTabMount(),
  false,
  "Calendar/tab mount must never start the offline PIN DB (post-login freeze)"
);

assert.equal(
  shouldQueryOfflinePincodeOnInteractivePath(false),
  false,
  "Interactive PIN must skip offline until DB is ready (prevents JS freeze)"
);
assert.equal(shouldQueryOfflinePincodeOnInteractivePath(true), true);

console.log("pincodeWarmPolicy.test.ts: ok");
