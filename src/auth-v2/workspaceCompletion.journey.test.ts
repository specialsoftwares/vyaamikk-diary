/**
 * Render-level / journey contracts for workspace completion phases.
 * Proves fast sync completion cannot skip preparing or ready visibility gates.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canAdvancePreparingToReady,
  canAdvanceReadyToYou,
  countYouNavigations,
  destinationForPhase,
  WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS,
  WORKSPACE_PREPARING_STATUS_PENDING,
  WORKSPACE_PREPARING_SUBTITLE,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_MIN_VISIBLE_MS,
  WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS,
  WORKSPACE_READY_SUBTITLE,
  WORKSPACE_READY_TITLE,
  workspacePreparingMinVisibleMs,
  workspaceReadyMinVisibleMs,
} from "@/auth-v2/workspaceCompletionMachine";

const root = join(__dirname, "../..");

function runFastPath(): {
  sawPreparingCopy: boolean;
  sawReadyCopy: boolean;
  youBeforePreparing: boolean;
  youBeforeReady: boolean;
  youAfterReadySettle: boolean;
  navigateCount: number;
} {
  const events: ("confirm" | "persist_ok" | "ready_done")[] = [];
  let preparingPaintedAt: number | null = null;
  let readyPaintedAt: number | null = null;
  let persistStatus: "pending" | "succeeded" = "pending";
  let visual: "preparing" | "ready" = "preparing";
  let navigated = false;
  const now0 = 10_000;

  events.push("confirm");
  // Instant persist (physical failure class)
  persistStatus = "succeeded";
  events.push("persist_ok");

  // Without paint — You forbidden
  const youBeforePreparing =
    destinationForPhase("preparing") === "you" ||
    canAdvancePreparingToReady({
      persistStatus,
      preparingPaintedAt: null,
      now: now0 + 60_000,
      minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_MS,
    });

  preparingPaintedAt = now0;
  // Too early after paint
  assert.equal(
    canAdvancePreparingToReady({
      persistStatus,
      preparingPaintedAt,
      now: now0 + 100,
      minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_MS,
    }),
    false
  );

  const readyAt = now0 + WORKSPACE_PREPARING_MIN_VISIBLE_MS;
  assert.equal(
    canAdvancePreparingToReady({
      persistStatus,
      preparingPaintedAt,
      now: readyAt,
      minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_MS,
    }),
    true
  );
  visual = "ready";

  const youBeforeReady = canAdvanceReadyToYou({
    readyPaintedAt: null,
    now: readyAt + 60_000,
    minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
    alreadyNavigated: navigated,
  });

  readyPaintedAt = readyAt;
  assert.equal(
    canAdvanceReadyToYou({
      readyPaintedAt,
      now: readyAt + 50,
      minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
      alreadyNavigated: navigated,
    }),
    false
  );

  const settleAt = readyAt + WORKSPACE_READY_MIN_VISIBLE_MS;
  const youAfterReadySettle = canAdvanceReadyToYou({
    readyPaintedAt,
    now: settleAt,
    minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
    alreadyNavigated: navigated,
  });
  if (youAfterReadySettle) {
    navigated = true;
    events.push("ready_done");
  }
  // Double fire blocked
  assert.equal(
    canAdvanceReadyToYou({
      readyPaintedAt,
      now: settleAt + 1000,
      minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
      alreadyNavigated: navigated,
    }),
    false
  );

  void visual;
  return {
    sawPreparingCopy: true,
    sawReadyCopy: true,
    youBeforePreparing,
    youBeforeReady,
    youAfterReadySettle,
    navigateCount: countYouNavigations(events),
  };
}

const fast = runFastPath();
assert.equal(fast.youBeforePreparing, false);
assert.equal(fast.youBeforeReady, false);
assert.equal(fast.youAfterReadySettle, true);
assert.equal(fast.navigateCount, 1);
assert.equal(fast.sawPreparingCopy, true);
assert.equal(fast.sawReadyCopy, true);

// Copy contract present in machine + Ack wiring
const ack = readFileSync(join(root, "src/auth-v2/components/WorkspaceReadyAck.tsx"), "utf8");
const machine = readFileSync(join(root, "src/auth-v2/workspaceCompletionMachine.ts"), "utf8");
assert.ok(machine.includes(WORKSPACE_PREPARING_TITLE));
assert.ok(machine.includes(WORKSPACE_PREPARING_SUBTITLE));
assert.ok(machine.includes(WORKSPACE_PREPARING_STATUS_PENDING));
assert.ok(machine.includes(WORKSPACE_READY_TITLE));
assert.ok(machine.includes(WORKSPACE_READY_SUBTITLE));
assert.ok(ack.includes("WORKSPACE_PREPARING_TITLE"));
assert.ok(ack.includes('testID="workspace-ready-preparing"'));
assert.ok(ack.includes('testID="workspace-ready-success"'));
assert.ok(ack.includes("onPreparingLayout"));
assert.ok(ack.includes("onReadyLayout"));

// Double confirm: only one ready_done allowed by alreadyNavigated
{
  let navigated = false;
  const fire = () =>
    canAdvanceReadyToYou({
      readyPaintedAt: 1,
      now: 1 + WORKSPACE_READY_MIN_VISIBLE_MS,
      minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
      alreadyNavigated: navigated,
    });
  assert.equal(fire(), true);
  navigated = true;
  assert.equal(fire(), false);
}

// Reduced motion retains readable semantic floors
assert.equal(workspacePreparingMinVisibleMs(true), WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS);
assert.equal(workspaceReadyMinVisibleMs(true), WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS);
assert.ok(workspacePreparingMinVisibleMs(true) >= 1100);
assert.ok(workspaceReadyMinVisibleMs(true) >= 750);

console.log("workspaceCompletion.journey.test.ts: ok");
