import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  shouldQueryOfflinePincodeOnInteractivePath,
  shouldScheduleOfflinePincodeWarmAfterInteractiveLookup,
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

assert.equal(
  shouldScheduleOfflinePincodeWarmAfterInteractiveLookup(),
  false,
  "Interactive PIN must not schedule JS-thread india-pincode warm after lookup"
);

const resolverSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "pincodeResolver.ts"),
  "utf8"
);
assert.doesNotMatch(
  resolverSrc,
  /scheduleDeferredIndiaPincodeWarm\s*\(/,
  "pincodeResolver must not start offline warm on the interactive lookup path"
);

console.log("pincodeWarmPolicy.test.ts: ok");
