import assert from "node:assert/strict";

import {
  claimSessionLastActiveTouch,
  clearSessionLastActiveTouch,
  releaseSessionLastActiveTouch,
  resetSessionLastActiveTouchForTests,
} from "./sessionLastActiveTouch";

resetSessionLastActiveTouchForTests();

{
  const t0 = 1_700_000_000_000;
  const first = claimSessionLastActiveTouch({
    uid: "u1",
    previousAt: 0,
    now: t0,
  });
  assert.equal(first.now, t0);

  const duplicate = claimSessionLastActiveTouch({
    uid: "u1",
    previousAt: 0,
    now: t0 + 10,
  });
  assert.equal(duplicate.now, null, "in-flight claim blocks Strict Mode double-invoke");

  releaseSessionLastActiveTouch("u1");

  const throttled = claimSessionLastActiveTouch({
    uid: "u1",
    previousAt: t0,
    now: t0 + 30_000,
  });
  assert.equal(throttled.now, null, "throttle window still applies after release");

  const afterWindow = claimSessionLastActiveTouch({
    uid: "u1",
    previousAt: t0,
    now: t0 + 61_000,
  });
  assert.equal(afterWindow.now, t0 + 61_000);
  releaseSessionLastActiveTouch("u1");
}

{
  clearSessionLastActiveTouch("u1");
  const t1 = 1_800_000_000_000;
  const a = claimSessionLastActiveTouch({ uid: "u1", previousAt: 0, now: t1 });
  assert.equal(a.now, t1);
  releaseSessionLastActiveTouch("u1");
  clearSessionLastActiveTouch("u1");

  const b = claimSessionLastActiveTouch({ uid: "u2", previousAt: 0, now: t1 + 100 });
  assert.equal(b.now, t1 + 100, "new uid may claim after prior session cleared");
  releaseSessionLastActiveTouch("u2");
}

resetSessionLastActiveTouchForTests();
console.log("sessionLastActiveTouch.test.ts: ok");
