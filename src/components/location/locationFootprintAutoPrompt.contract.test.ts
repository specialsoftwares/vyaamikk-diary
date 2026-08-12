import assert from "node:assert/strict";

import { LOCATION_FOOTPRINT_AUTO_PROMPT_ENABLED_V1 } from "@/components/location/locationFootprintAutoPrompt";

assert.equal(
  LOCATION_FOOTPRINT_AUTO_PROMPT_ENABLED_V1,
  false,
  "newly completed users must reach You with no immediate GPS/location prompt"
);

console.log("locationFootprintAutoPrompt.contract.test.ts: ok");
