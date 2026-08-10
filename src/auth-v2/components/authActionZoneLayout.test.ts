import assert from "node:assert/strict";

import {
  AUTH_ACTION_ZONE_ABOVE,
  AUTH_ACTION_ZONE_BELOW,
  authActionZoneAboveShare,
} from "./authActionZoneLayout";

const share = authActionZoneAboveShare();
assert.ok(AUTH_ACTION_ZONE_ABOVE > AUTH_ACTION_ZONE_BELOW);
assert.ok(share >= 0.48, `expected enough lift above the cluster, got ${share}`);
assert.ok(share <= 0.58, `expected cluster not glued to the bottom edge, got ${share}`);

console.log("authActionZoneLayout.test.ts: ok");
