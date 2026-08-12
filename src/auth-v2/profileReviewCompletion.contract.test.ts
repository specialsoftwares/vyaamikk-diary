import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertReviewCompletionUsesWorkspaceReady,
  assertWorkspaceReadyCopy,
  canAdvancePreparingToReady,
  canAdvanceReadyToYou,
  countFinalYouNavigations,
  destinationAfterReviewEditorCommit,
  destinationDuringWorkspaceReady,
  destinationForPhase,
  nextReviewPhaseAfterPersist,
  phaseImmediatelyAfterReviewConfirm,
  shouldNavigateToYouAfterWorkspaceReady,
  simulateFastCompletionJourney,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_TITLE,
} from "@/auth-v2/profileReviewCompletion";
import {
  WORKSPACE_COMPLETION_REAL_OPS,
  WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS,
  WORKSPACE_READY_MIN_VISIBLE_MS,
  WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS,
} from "@/auth-v2/workspaceCompletionMachine";

const root = join(__dirname, "../..");

assert.equal(phaseImmediatelyAfterReviewConfirm(), "committing");
assert.notEqual(phaseImmediatelyAfterReviewConfirm() as string, "you");

assert.equal(
  shouldNavigateToYouAfterWorkspaceReady({ phase: "preparing", alreadyNavigated: false }),
  false,
  "must not navigate to You during preparing"
);
assert.equal(
  shouldNavigateToYouAfterWorkspaceReady({ phase: "ready", alreadyNavigated: false }),
  true
);
assert.equal(
  shouldNavigateToYouAfterWorkspaceReady({ phase: "ready", alreadyNavigated: true }),
  false,
  "exactly-once navigation"
);

assert.ok(
  WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS >= 1100,
  "reduced motion must keep preparing readable (≥1100ms)"
);
assert.ok(
  WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS >= 750,
  "reduced motion must keep ready readable (≥750ms)"
);
assert.ok(WORKSPACE_PREPARING_MIN_VISIBLE_MS >= 1100);
assert.ok(WORKSPACE_READY_MIN_VISIBLE_MS >= 750);

// Reduced-motion path still requires paint + readable mins
assert.equal(
  canAdvancePreparingToReady({
    persistStatus: "succeeded",
    preparingPaintedAt: 1000,
    now: 1000 + 500,
    minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS,
  }),
  false,
  "reduced-motion preparing must not collapse to ~200–500ms"
);
assert.equal(
  canAdvancePreparingToReady({
    persistStatus: "succeeded",
    preparingPaintedAt: 1000,
    now: 1000 + WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS,
    minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS,
  }),
  true
);

// Fast completion: paint + min → ready
assert.equal(
  canAdvancePreparingToReady({
    persistStatus: "succeeded",
    preparingPaintedAt: 1000,
    now: 1000 + WORKSPACE_PREPARING_MIN_VISIBLE_MS,
    minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  }),
  true
);

// Slow completion: persist still pending → cannot ready
assert.equal(
  canAdvancePreparingToReady({
    persistStatus: "pending",
    preparingPaintedAt: 1000,
    now: 1000 + 60_000,
    minVisibleMs: WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  }),
  false,
  "slow/pending persist must keep preparing"
);

// Error: failed persist → review
assert.equal(
  nextReviewPhaseAfterPersist({
    persistOk: false,
    preparingPaintedAt: 1000,
    now: 10_000,
  }),
  "review"
);

// Ready must paint before You
assert.equal(
  canAdvanceReadyToYou({
    readyPaintedAt: null,
    now: 99_000,
    minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
    alreadyNavigated: false,
  }),
  false,
  "ready without paint must not navigate"
);
assert.equal(
  canAdvanceReadyToYou({
    readyPaintedAt: 1000,
    now: 1000 + WORKSPACE_READY_MIN_VISIBLE_MS,
    minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
    alreadyNavigated: false,
  }),
  true
);
assert.equal(
  canAdvanceReadyToYou({
    readyPaintedAt: 1000,
    now: 1000 + WORKSPACE_READY_MIN_VISIBLE_MS,
    minVisibleMs: WORKSPACE_READY_MIN_VISIBLE_MS,
    alreadyNavigated: true,
  }),
  false,
  "double navigate blocked"
);

assert.equal(destinationDuringWorkspaceReady("preparing"), "workspace");
assert.equal(destinationForPhase("preparing"), "workspace");
assert.equal(destinationForPhase("ready"), "workspace");
assert.equal(destinationForPhase("you"), "you");
assert.equal(destinationAfterReviewEditorCommit(), "review");

assert.equal(countFinalYouNavigations(["confirm", "persist_ok", "ready_done"]), 1);
assert.equal(countFinalYouNavigations(["confirm", "persist_ok"]), 0);
assert.equal(
  countFinalYouNavigations(["ready_done", "ready_done"]),
  2,
  "caller must guard exactly-once; counter reports events"
);

const fast = simulateFastCompletionJourney();
assert.equal(fast.youBeforePreparingPaint, false);
assert.equal(fast.youBeforeReadyPaint, false);
assert.ok(fast.phases.includes("preparing"));

// Real ops documented — no fake Firestore hydration claims in copy source
assert.ok(WORKSPACE_COMPLETION_REAL_OPS.production.includes("updateProfileWithProfileCompletedAt"));
assert.ok(WORKSPACE_COMPLETION_REAL_OPS.harness.includes("simulateLocalReviewSessionCommit"));

const presentation = readFileSync(
  join(root, "src/auth-v2/screens/ProfileReviewPresentation.tsx"),
  "utf8"
);
assert.equal(assertReviewCompletionUsesWorkspaceReady(presentation), true);
assert.match(presentation, /setPhase\("workspace"\)/);
assert.match(presentation, /persistStatus/);
assert.ok(
  presentation.indexOf("await onConfirmPersist()") <
    presentation.indexOf('setPhase("workspace")'),
  "Workspace Ready must not paint before persist succeeds"
);
assert.doesNotMatch(
  presentation,
  /setPhase\("workspace"\);[\s\S]*await onConfirmPersist\(\)/,
  "must not enter Preparing before persist"
);
assert.doesNotMatch(
  presentation,
  /await onConfirmPersist\(\);\s*onSuccessNavigate/,
  "must not navigate to You directly after persist"
);

const ack = readFileSync(join(root, "src/auth-v2/components/WorkspaceReadyAck.tsx"), "utf8");
const machine = readFileSync(join(root, "src/auth-v2/workspaceCompletionMachine.ts"), "utf8");
assert.equal(assertWorkspaceReadyCopy(ack, machine), true);
assert.match(ack, /WORKSPACE_PREPARING_TITLE/);
assert.match(ack, /WORKSPACE_READY_TITLE/);
assert.match(machine, new RegExp(WORKSPACE_PREPARING_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(machine, new RegExp(WORKSPACE_READY_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(ack, /onLayout=\{onPreparingLayout\}/);
assert.match(ack, /onLayout=\{onReadyLayout\}/);
assert.match(ack, /canAdvancePreparingToReady/);
assert.match(ack, /canAdvanceReadyToYou/);
assert.doesNotMatch(ack, /Setting up your workspace/);
assert.match(ack, /\[workspace-ready\]/);

const productionReview = readFileSync(
  join(root, "src/auth-v2/screens/ProfileReviewScreen.tsx"),
  "utf8"
);
assert.match(productionReview, /completeOnboardingProfile/);
assert.match(productionReview, /ProfileReviewPresentation/);
assert.match(productionReview, /onSuccessNavigate/);
assert.match(productionReview, /router\.replace\("\/\(app\)\/\(tabs\)\/you"\)/);
assert.doesNotMatch(
  productionReview,
  /onConfirmPersist=\{async \(\) => \{[^}]*router\.replace/,
  "production must not route to You inside onConfirmPersist"
);

const harnessApp = readFileSync(
  join(root, "tools/onboarding-ux-harness/src/HarnessApp.tsx"),
  "utf8"
);
assert.match(harnessApp, /simulateHarnessProfileCompletion/);
assert.match(harnessApp, /onReviewSuccessNavigate/);
assert.doesNotMatch(
  harnessApp,
  /onConfirmPersist=\{async \(\) => \{[^}]*setScreen\("you_preview"\)/,
  "harness must not jump to You inside onConfirmPersist"
);
assert.doesNotMatch(
  harnessApp,
  /onCommit=\{[\s\S]*?setScreen\("you_preview"\)/,
  "onCommit must not navigate to You"
);
assert.match(harnessApp, /phoneE164: verifiedPhoneE164/);
assert.match(harnessApp, /email: verifiedEmail/);

console.log("profileReviewCompletion.contract.test.ts: ok");
