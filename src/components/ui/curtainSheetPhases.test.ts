import assert from "node:assert/strict";

import {
  CURTAIN_CLOSE_TIMEOUT_MS,
  createCurtainPhaseController,
  type CurtainPhase,
} from "./curtainSheetPhases";

interface FakeTimer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

function makeHarness() {
  const phases: CurtainPhase[] = [];
  let teardowns = 0;
  const timers: FakeTimer[] = [];

  const controller = createCurtainPhaseController({
    onPhaseChange: (p) => phases.push(p),
    onTeardown: () => {
      teardowns += 1;
    },
    scheduleTimeout: (fn, ms) => {
      const timer: FakeTimer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });

  const fireTimers = () => {
    for (const t of timers.splice(0)) {
      if (!t.cancelled) t.fn();
    }
  };

  return {
    controller,
    phases,
    timers,
    fireTimers,
    getTeardowns: () => teardowns,
  };
}

function testOpenCloseCycle() {
  const h = makeHarness();
  assert.equal(h.controller.getPhase(), "closed");

  assert.equal(h.controller.requestOpen(), true);
  assert.equal(h.controller.getPhase(), "opening");
  h.controller.handleOpenSettled();
  assert.equal(h.controller.getPhase(), "open");

  let after = 0;
  assert.equal(h.controller.requestClose(() => (after += 1)), true);
  assert.equal(h.controller.getPhase(), "closing");
  assert.equal(h.getTeardowns(), 0);

  h.controller.handleCloseSettled();
  assert.equal(h.controller.getPhase(), "closed");
  assert.equal(h.getTeardowns(), 1);
  assert.equal(after, 1, "afterClose runs after teardown");
}

function testInterruptedCloseAnimationStillTearsDown() {
  // Spring cancelled / finished === false: component still calls
  // handleCloseSettled from the spring callback — teardown must run.
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  h.controller.requestClose();
  h.controller.handleCloseSettled(); // finished === false path — same entry
  assert.equal(h.controller.getPhase(), "closed");
  assert.equal(h.getTeardowns(), 1);
}

function testTimeoutFallbackWhenCallbackNeverFires() {
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  h.controller.requestClose();
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, CURTAIN_CLOSE_TIMEOUT_MS);

  // Spring callback dropped entirely — the defensive timeout must tear down.
  h.fireTimers();
  assert.equal(h.controller.getPhase(), "closed");
  assert.equal(h.getTeardowns(), 1);
}

function testTeardownIsIdempotent() {
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  let after = 0;
  h.controller.requestClose(() => (after += 1));

  h.controller.handleCloseSettled();
  h.controller.handleCloseSettled(); // duplicate settle
  h.fireTimers(); // late timeout after settle
  assert.equal(h.getTeardowns(), 1, "teardown fired exactly once");
  assert.equal(after, 1, "afterClose fired exactly once");
}

function testCloseWhileClosingPreservesFirstAfterClose() {
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  const calls: string[] = [];
  h.controller.requestClose(() => calls.push("first"));
  assert.equal(h.controller.requestClose(() => calls.push("second")), false);
  h.controller.handleCloseSettled();
  assert.deepEqual(calls, ["first"]);
}

function testCloseWhenAlreadyClosedRunsAfterImmediately() {
  const h = makeHarness();
  let after = 0;
  assert.equal(h.controller.requestClose(() => (after += 1)), false);
  assert.equal(after, 1);
  assert.equal(h.getTeardowns(), 0, "no teardown when never opened");
}

function testReopenDuringCloseAbortsTeardown() {
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  let after = 0;
  h.controller.requestClose(() => (after += 1));
  assert.equal(h.controller.getPhase(), "closing");

  // User re-opens before the close settles.
  assert.equal(h.controller.requestOpen(), true);
  assert.equal(h.controller.getPhase(), "opening");

  // The cancelled close spring's callback and stale timeout must be no-ops.
  h.controller.handleCloseSettled();
  h.fireTimers();
  assert.equal(h.controller.getPhase(), "opening");
  assert.equal(h.getTeardowns(), 0);
  assert.equal(after, 0, "aborted dismissal must not fire afterClose");

  h.controller.handleOpenSettled();
  assert.equal(h.controller.getPhase(), "open");
}

function testRepeatedOpenCloseCycles() {
  const h = makeHarness();
  for (let i = 0; i < 25; i += 1) {
    assert.equal(h.controller.requestOpen(), true, `cycle ${i} open`);
    h.controller.handleOpenSettled();
    assert.equal(h.controller.requestClose(), true, `cycle ${i} close`);
    h.controller.handleCloseSettled();
    assert.equal(h.controller.getPhase(), "closed");
  }
  assert.equal(h.getTeardowns(), 25);
  // Every armed timeout was either cancelled or is now stale and harmless.
  h.fireTimers();
  assert.equal(h.getTeardowns(), 25);
}

function testDisposeClearsPendingWork() {
  const h = makeHarness();
  h.controller.requestOpen();
  h.controller.handleOpenSettled();
  let after = 0;
  h.controller.requestClose(() => (after += 1));

  h.controller.dispose();
  h.controller.handleCloseSettled();
  h.fireTimers();
  assert.equal(h.getTeardowns(), 0, "no teardown after dispose");
  assert.equal(after, 0);
  assert.equal(h.controller.requestOpen(), false, "disposed controller inert");
  assert.equal(h.timers.every((t) => t.cancelled), true, "timers cancelled");
}

function testDuplicateOpenIsIgnored() {
  const h = makeHarness();
  assert.equal(h.controller.requestOpen(), true);
  assert.equal(h.controller.requestOpen(), false, "opening dedupe");
  h.controller.handleOpenSettled();
  assert.equal(h.controller.requestOpen(), false, "open dedupe");
}

function main() {
  testOpenCloseCycle();
  testInterruptedCloseAnimationStillTearsDown();
  testTimeoutFallbackWhenCallbackNeverFires();
  testTeardownIsIdempotent();
  testCloseWhileClosingPreservesFirstAfterClose();
  testCloseWhenAlreadyClosedRunsAfterImmediately();
  testReopenDuringCloseAbortsTeardown();
  testRepeatedOpenCloseCycles();
  testDisposeClearsPendingWork();
  testDuplicateOpenIsIgnored();
  console.log("curtainSheetPhases.test.ts: ok");
}

main();
