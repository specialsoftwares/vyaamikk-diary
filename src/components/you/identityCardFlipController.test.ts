import assert from "node:assert/strict";

import { createFlipLockController } from "./identityCardFlipController";

interface FakeTimer {
  fn: () => void;
  cancelled: boolean;
}

function makeHarness() {
  const timers: FakeTimer[] = [];
  let forcedReleases = 0;
  const controller = createFlipLockController({
    timeoutMs: 880,
    scheduleTimeout: (fn) => {
      const timer: FakeTimer = { fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onForcedRelease: () => {
      forcedReleases += 1;
    },
  });
  const fireTimers = () => {
    for (const t of timers.splice(0)) {
      if (!t.cancelled) t.fn();
    }
  };
  return { controller, fireTimers, getForcedReleases: () => forcedReleases, timers };
}

function testNormalFlipCycle() {
  const h = makeHarness();
  assert.equal(h.controller.acquire(), true);
  assert.equal(h.controller.isLocked(), true);
  assert.equal(h.controller.acquire(), false, "duplicate flip rejected");
  assert.equal(h.controller.release(), true);
  assert.equal(h.controller.isLocked(), false);
  assert.equal(h.controller.release(), false, "release idempotent");
  h.fireTimers();
  assert.equal(h.getForcedReleases(), 0, "cancelled timer never fires");
}

function testInterruptedAnimationReleaseViaCallback() {
  // finished === false path: component calls release() the same as success.
  const h = makeHarness();
  h.controller.acquire();
  assert.equal(h.controller.release(), true);
  assert.equal(h.controller.isLocked(), false);
}

function testStuckLockRecoveredByTimeout() {
  const h = makeHarness();
  h.controller.acquire();
  // Animation callback dropped entirely.
  h.fireTimers();
  assert.equal(h.controller.isLocked(), false, "timeout released stuck lock");
  assert.equal(h.getForcedReleases(), 1, "component asked to snap transforms");
  assert.equal(h.controller.acquire(), true, "card responsive again");
}

function testRapidRepeatedTaps() {
  const h = makeHarness();
  let accepted = 0;
  for (let i = 0; i < 10; i += 1) {
    if (h.controller.acquire()) accepted += 1;
  }
  assert.equal(accepted, 1, "only one flip runs at a time");
  h.controller.release();
  assert.equal(h.controller.acquire(), true, "next tap accepted after release");
  h.controller.release();
}

function testBlurAndUnmountRelease() {
  const h = makeHarness();
  h.controller.acquire();
  // Blur path calls release().
  assert.equal(h.controller.release(), true);

  h.controller.acquire();
  h.controller.dispose();
  assert.equal(h.controller.isLocked(), false, "dispose releases");
  h.fireTimers();
  assert.equal(h.getForcedReleases(), 0, "no forced release after dispose");
  assert.equal(h.controller.acquire(), false, "disposed controller inert");
}

function testRepeatedCyclesNeverAccumulateTimers() {
  const h = makeHarness();
  for (let i = 0; i < 20; i += 1) {
    assert.equal(h.controller.acquire(), true);
    assert.equal(h.controller.release(), true);
  }
  h.fireTimers();
  assert.equal(h.getForcedReleases(), 0);
  assert.equal(h.timers.every((t) => t.cancelled), true, "all timers cancelled");
}

function main() {
  testNormalFlipCycle();
  testInterruptedAnimationReleaseViaCallback();
  testStuckLockRecoveredByTimeout();
  testRapidRepeatedTaps();
  testBlurAndUnmountRelease();
  testRepeatedCyclesNeverAccumulateTimers();
  console.log("identityCardFlipController.test.ts: ok");
}

main();
