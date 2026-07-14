import assert from "node:assert/strict";

import {
  createLanguageTransitionController,
  type LanguageTransitionPhase,
} from "./languageTransitionController";
import type { Lang } from "./types";

interface HarnessOptions {
  applyImpl?: (lang: Lang) => Promise<void>;
  timeoutMs?: number;
  minVisibleMs?: number;
}

function makeHarness(opts: HarnessOptions = {}) {
  const phases: Array<{ phase: LanguageTransitionPhase; target: Lang | null }> = [];
  const applied: Lang[] = [];
  const persisted: Lang[] = [];
  let settles = 0;

  const controller = createLanguageTransitionController({
    applyLanguage: async (lang) => {
      if (opts.applyImpl) {
        await opts.applyImpl(lang);
      }
      applied.push(lang);
    },
    persistLanguage: async (lang) => {
      persisted.push(lang);
    },
    settle: async () => {
      settles += 1;
    },
    waitForOverlayIn: () => Promise.resolve(),
    onPhaseChange: (phase, target) => {
      phases.push({ phase, target });
    },
    // Real timers with tiny configured durations keep wall-time low without
    // distorting timeout semantics.
    minVisibleMs: opts.minVisibleMs ?? 10,
    timeoutMs: opts.timeoutMs ?? 50,
    overlayInMaxMs: 10,
  });

  return {
    controller,
    phases,
    applied,
    persisted,
    getSettles: () => settles,
  };
}

async function testSuccessPathPhasesAndPersistOrder() {
  const h = makeHarness();
  const result = await h.controller.request("hi", "en");
  assert.equal(result.status, "applied");
  assert.deepEqual(h.applied, ["hi"]);
  assert.deepEqual(h.persisted, ["hi"], "persist only after successful apply");
  assert.equal(h.getSettles(), 1);
  assert.deepEqual(
    h.phases.map((p) => p.phase),
    ["preparing", "switching", "settling", "idle"],
    "explicit phase sequence"
  );
  assert.equal(h.phases[h.phases.length - 1].target, null, "idle clears target");
  assert.equal(h.controller.getPhase(), "idle");
}

async function testFailurePathTearsDownAndDoesNotPersist() {
  const h = makeHarness({
    applyImpl: async () => {
      throw new Error("locale bundle failed to load");
    },
  });
  const result = await h.controller.request("ta", "en");
  assert.equal(result.status, "failed");
  assert.deepEqual(h.persisted, [], "failed apply never persists");
  assert.equal(h.controller.getPhase(), "idle", "teardown reached idle on failure");
  assert.equal(h.phases[h.phases.length - 1].phase, "idle");
}

async function testTimeoutPathTearsDown() {
  const h = makeHarness({
    applyImpl: () => new Promise(() => undefined), // hangs forever
    timeoutMs: 10,
  });
  const result = await h.controller.request("te", "en");
  assert.equal(result.status, "failed");
  assert.deepEqual(h.persisted, []);
  assert.equal(h.controller.getPhase(), "idle", "timeout still tears down to idle");
}

async function testRapidDuplicateSelectionRejected() {
  let release: (() => void) | null = null;
  const h = makeHarness({
    applyImpl: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    timeoutMs: 1000,
  });

  const first = h.controller.request("gu", "en");
  // Immediate duplicate taps while in flight:
  const second = await h.controller.request("gu", "en");
  const third = await h.controller.request("hi", "en");
  assert.equal(second.status, "rejected");
  assert.equal(third.status, "rejected");

  release!();
  const firstResult = await first;
  assert.equal(firstResult.status, "applied");
  assert.deepEqual(h.applied, ["gu"], "only one transition ran");

  // After returning to idle a new selection is accepted (release the new
  // hanging applyImpl promise once the request reaches it).
  const fourth = h.controller.request("hi", "gu");
  await new Promise((r) => setTimeout(r, 20));
  release!();
  assert.equal((await fourth).status, "applied");
  assert.deepEqual(h.applied, ["gu", "hi"]);
}

async function testSameLanguageRejected() {
  const h = makeHarness();
  const result = await h.controller.request("en", "en");
  assert.equal(result.status, "rejected");
  assert.deepEqual(h.applied, []);
  assert.equal(h.phases.length, 0, "no phase churn for no-op selection");
}

async function testInstantPathSkipsHold() {
  const h = makeHarness({ minVisibleMs: 10_000 });
  const start = Date.now();
  const result = await h.controller.request("hi", "en", { instant: true });
  assert.equal(result.status, "applied");
  assert.ok(Date.now() - start < 5_000, "instant path must not hold for minVisibleMs");
  assert.equal(h.controller.getPhase(), "idle");
}

async function testLanguagePreservedWhenPersistFails() {
  const persisted: Lang[] = [];
  const phases: LanguageTransitionPhase[] = [];
  const controller = createLanguageTransitionController({
    applyLanguage: async () => undefined,
    persistLanguage: async () => {
      throw new Error("storage unavailable");
    },
    settle: async () => undefined,
    waitForOverlayIn: () => Promise.resolve(),
    onPhaseChange: (phase) => phases.push(phase),
    minVisibleMs: 0,
    timeoutMs: 50,
    overlayInMaxMs: 5,
  });
  const result = await controller.request("ta", "en");
  // Apply succeeded before persist threw — the selection is preserved.
  assert.equal(result.status, "applied");
  assert.equal(phases[phases.length - 1], "idle");
  assert.equal(persisted.length, 0);
}

async function testDisposeStopsPhaseNotifications() {
  let release: (() => void) | null = null;
  const phases: LanguageTransitionPhase[] = [];
  const controller = createLanguageTransitionController({
    applyLanguage: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    persistLanguage: async () => undefined,
    settle: async () => undefined,
    waitForOverlayIn: () => Promise.resolve(),
    onPhaseChange: (phase) => phases.push(phase),
    minVisibleMs: 0,
    timeoutMs: 1000,
    overlayInMaxMs: 5,
  });

  const pending = controller.request("hi", "en");
  // Let the transition reach applyLanguage before disposing mid-flight.
  await new Promise((r) => setTimeout(r, 20));
  const seenBeforeDispose = phases.length;
  controller.dispose();
  release!();
  await pending;
  assert.equal(
    phases.length,
    seenBeforeDispose,
    "no phase callbacks after dispose (unmount safety)"
  );
  const after = await controller.request("ta", "en");
  assert.equal(after.status, "rejected", "disposed controller rejects requests");
}

async function testBrokenOverlayAnimationDoesNotBlockSwitch() {
  const h = makeHarness();
  // waitForOverlayIn that never resolves — bounded by overlayInMaxMs.
  const controller = createLanguageTransitionController({
    applyLanguage: async (lang) => {
      h.applied.push(lang);
    },
    persistLanguage: async (lang) => {
      h.persisted.push(lang);
    },
    settle: async () => undefined,
    waitForOverlayIn: () => new Promise(() => undefined),
    onPhaseChange: () => undefined,
    minVisibleMs: 0,
    timeoutMs: 100,
    overlayInMaxMs: 5,
  });
  const result = await controller.request("gu", "en");
  assert.equal(result.status, "applied", "language preserved despite dead overlay");
  assert.deepEqual(h.applied, ["gu"]);
}

async function main() {
  await testSuccessPathPhasesAndPersistOrder();
  await testFailurePathTearsDownAndDoesNotPersist();
  await testTimeoutPathTearsDown();
  await testRapidDuplicateSelectionRejected();
  await testSameLanguageRejected();
  await testInstantPathSkipsHold();
  await testLanguagePreservedWhenPersistFails();
  await testDisposeStopsPhaseNotifications();
  await testBrokenOverlayAnimationDoesNotBlockSwitch();
  console.log("languageTransitionController.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
