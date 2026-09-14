import assert from "node:assert/strict";

import { isPublicLightweightRoute } from "./publicRoutes";
import {
  FORMERLY_PROVIDER_SKIPPED_PATHS,
  decideRootDataProviders,
} from "./rootDataProviders";

function testAlwaysMountsFullTree() {
  const d = decideRootDataProviders("/");
  assert.equal(d.mountLocalDb, true);
  assert.equal(d.mountAuth, true);
  assert.equal(d.mountSync, true);
  assert.equal(d.mountAppFeedback, true);
  assert.equal(d.mountSubscription, true);
}

function testPathnameCannotSkipAuth() {
  const paths = [
    "/",
    "/(app)/(tabs)/you",
    "/(auth)/v2",
    "/landing",
    "/legal/privacy",
    "/settings",
    "",
    undefined,
  ];
  for (const path of paths) {
    const d = decideRootDataProviders(path);
    assert.equal(d.mountAuth, true, `auth must mount for ${String(path)}`);
    assert.equal(d.mountLocalDb, true, `localDb must mount for ${String(path)}`);
    assert.equal(d.mountSync, true, `sync must mount for ${String(path)}`);
    assert.equal(
      d.mountSubscription,
      true,
      `subscription must mount for ${String(path)}`
    );
  }
}

function testPublicRoutesStillClassifiedButProvidersStay() {
  for (const path of FORMERLY_PROVIDER_SKIPPED_PATHS) {
    assert.equal(
      isPublicLightweightRoute(path),
      true,
      `${path} remains a public lightweight *route* for marketing/layout purposes`
    );
    const d = decideRootDataProviders(path);
    assert.equal(
      d.mountAuth,
      true,
      `${path} must still mount AuthProvider (no path-gated provider swap)`
    );
  }
}

function testAuthenticatedPathsUnchanged() {
  assert.equal(isPublicLightweightRoute("/"), false);
  assert.equal(isPublicLightweightRoute("/(app)/(tabs)/you"), false);
  assert.equal(decideRootDataProviders("/(app)/(tabs)/settings").mountAuth, true);
}

function main() {
  testAlwaysMountsFullTree();
  testPathnameCannotSkipAuth();
  testPublicRoutesStillClassifiedButProvidersStay();
  testAuthenticatedPathsUnchanged();
  console.log("rootDataProviders.test.ts: ok");
}

main();
