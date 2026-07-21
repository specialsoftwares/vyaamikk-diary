import assert from "node:assert/strict";

import { shouldWarmIndiaPincodeOnCalendarTabMount } from "./pincodeWarmPolicy";

assert.equal(
  shouldWarmIndiaPincodeOnCalendarTabMount(),
  false,
  "Calendar/tab mount must never start the offline PIN DB (post-login freeze)"
);

console.log("pincodeWarmPolicy.test.ts: ok");
