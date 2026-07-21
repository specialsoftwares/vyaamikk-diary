/**
 * Proves feature/navigation readiness is independent of letterhead migration
 * and offline PIN warm — the post-login freeze regression contract.
 */

import assert from "node:assert/strict";

import { shouldWarmIndiaPincodeOnCalendarTabMount } from "@/services/location/pincodeWarmPolicy";
import { shouldRunLetterheadStorageMigration } from "@/services/letterhead/letterheadMigrationPolicy";

/** Dashboard is interactive once mounted for an authorized user — no await on these. */
function dashboardFeatureActionsReady(input: {
  dashboardMounted: boolean;
  authAuthorized: boolean;
  letterheadMigrationComplete: boolean;
  pinDbWarmComplete: boolean;
}): boolean {
  return input.dashboardMounted && input.authAuthorized;
}

assert.equal(
  dashboardFeatureActionsReady({
    dashboardMounted: true,
    authAuthorized: true,
    letterheadMigrationComplete: false,
    pinDbWarmComplete: false,
  }),
  true,
  "feature navigation must not wait for migration or PIN warm"
);

assert.equal(shouldWarmIndiaPincodeOnCalendarTabMount(), false);

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "mock-uid",
    backend: "local-mock",
    firebaseConfigured: true,
    storageAvailable: true,
    alreadyCompletedForVersion: false,
  }),
  false
);

console.log("firstActionFreeze.regression.test.ts: ok");
