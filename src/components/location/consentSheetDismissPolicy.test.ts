import assert from "node:assert/strict";

import {
  isConsentDismissDisabled,
  shouldKeepConsentSheetVisible,
} from "./consentSheetDismissPolicy";

function testDismissClearsVisibilityEvenWhenBusy() {
  assert.equal(
    shouldKeepConsentSheetVisible({ dismissed: true, busy: true }),
    false,
    "dismiss wins over busy"
  );
}

function testNotDismissedStaysEligible() {
  assert.equal(
    shouldKeepConsentSheetVisible({ dismissed: false, busy: false }),
    true
  );
  assert.equal(
    shouldKeepConsentSheetVisible({ dismissed: false, busy: true }),
    true
  );
}

function testDismissControlNeverDisabledByBusy() {
  assert.equal(isConsentDismissDisabled(true), false);
  assert.equal(isConsentDismissDisabled(false), false);
}

function main() {
  testDismissClearsVisibilityEvenWhenBusy();
  testNotDismissedStaysEligible();
  testDismissControlNeverDisabledByBusy();
  console.log("consentSheetDismissPolicy.test.ts: ok");
}

main();
