import assert from "node:assert/strict";

import {
  LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS,
  languageOverlayPointerEvents,
} from "./languageOverlayTouchPolicy";

function testInterceptsOnlyWhileActivelyBlocking() {
  assert.equal(
    languageOverlayPointerEvents({ active: true, hiding: false }),
    "auto",
    "active transition captures touches"
  );
}

function testReleasesWhenActiveBecomesFalse() {
  assert.equal(
    languageOverlayPointerEvents({ active: false, hiding: false }),
    "none",
    "idle must release touches before hiding state updates"
  );
}

function testReleasesWhileHiding() {
  assert.equal(
    languageOverlayPointerEvents({ active: false, hiding: true }),
    "none"
  );
  assert.equal(
    languageOverlayPointerEvents({ active: true, hiding: true }),
    "none",
    "fade-out never re-captures touches"
  );
}

function testFailsafeBoundIsFinite() {
  assert.ok(LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS > 0);
  assert.ok(LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS < 5_000);
}

function main() {
  testInterceptsOnlyWhileActivelyBlocking();
  testReleasesWhenActiveBecomesFalse();
  testReleasesWhileHiding();
  testFailsafeBoundIsFinite();
  console.log("languageOverlayTouchPolicy.test.ts: ok");
}

main();
