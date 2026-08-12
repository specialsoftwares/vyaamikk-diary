/**
 * Harness owner-review restart + 3× Workspace Ready repeatability contracts.
 * DEV tooling only — asserts no production profile writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  harnessDefaultEntryScreen,
  harnessPhaseControlLabel,
  harnessTransientCompletionCleared,
  restartHarnessOnboardingReview,
  simulateHarnessWorkspaceReadyRuns,
} from "@/auth-v2/preview/harnessReviewRestart";
import { shouldNavigateHarnessYouAfterWorkspaceReady } from "@/auth-v2/preview/harnessPostLocationHandoff";

const root = join(__dirname, "../../..");

function main() {
  assert.equal(harnessDefaultEntryScreen(), "profile_review");
  assert.notEqual(harnessDefaultEntryScreen(), "you_preview");

  const session = {
    displayName: "Owner",
    businessName: "Changed Co",
    constitution: "LLP",
    gstin: "27AAAAA0000A1Z5",
    pinCode: "560001",
    phoneE164: "+919999888877",
    email: "changed@owner.test",
    logoUri: "file://logo.png",
  };

  // Terminal You → Restart → Review preserves session
  const fromYou = restartHarnessOnboardingReview({
    session,
    reviewJourneyKey: 2,
  });
  assert.equal(fromYou.screen, "profile_review");
  assert.equal(fromYou.workspaceYouNavigated, false);
  assert.equal(fromYou.reviewEditTarget, null);
  assert.equal(fromYou.reviewJourneyKey, 3);
  assert.equal(fromYou.session.phoneE164, "+919999888877");
  assert.equal(fromYou.session.email, "changed@owner.test");
  assert.equal(fromYou.session.gstin, "27AAAAA0000A1Z5");
  assert.equal(fromYou.session.logoUri, "file://logo.png");
  assert.equal(fromYou.session, session, "session object must be preserved (not fixture reset)");

  assert.equal(
    harnessTransientCompletionCleared({
      workspaceYouNavigated: fromYou.workspaceYouNavigated,
      reviewEditTarget: fromYou.reviewEditTarget,
      reviewJourneyKeyBefore: 2,
      reviewJourneyKeyAfter: fromYou.reviewJourneyKey,
    }),
    true
  );

  // Confirm after restart may enter preparing→ready→You once
  assert.equal(
    shouldNavigateHarnessYouAfterWorkspaceReady({
      phase: "ready",
      alreadyNavigated: fromYou.workspaceYouNavigated,
    }),
    true
  );

  // Three complete runs with restart between each
  const triple = simulateHarnessWorkspaceReadyRuns({ session, runs: 3 });
  assert.equal(triple.runResults.length, 3);
  for (let i = 0; i < 3; i++) {
    const r = triple.runResults[i]!;
    assert.equal(r.sawPreparing, true, `run ${i + 1} preparing`);
    assert.equal(r.sawReady, true, `run ${i + 1} ready`);
    assert.equal(r.youCount, 1, `run ${i + 1} You exactly once`);
    assert.equal(r.terminal, "you_preview");
    assert.equal(r.phoneE164, "+919999888877", "verified mobile preserved across restarts");
    assert.equal(r.email, "changed@owner.test", "verified email preserved across restarts");
  }
  assert.equal(triple.finalScreen, "profile_review");
  assert.equal(triple.finalSession.phoneE164, session.phoneE164);

  assert.equal(harnessPhaseControlLabel("profile_review"), "Open Review");
  assert.equal(harnessPhaseControlLabel("workspace_preparing"), "Open Workspace Preparing");
  assert.equal(harnessPhaseControlLabel("workspace_ready"), "Open Workspace Ready");
  assert.equal(harnessPhaseControlLabel("you_preview"), "Open You Preview");

  const harnessApp = readFileSync(
    join(root, "tools/onboarding-ux-harness/src/HarnessApp.tsx"),
    "utf8"
  );
  assert.equal(harnessApp.includes("Restart onboarding review"), true);
  assert.equal(harnessApp.includes("restartHarnessOnboardingReview"), true);
  assert.equal(harnessApp.includes("harnessDefaultEntryScreen"), true);
  assert.equal(harnessApp.includes("reviewJourneyKey"), true);
  assert.equal(harnessApp.includes("completeOnboardingProfile"), false);
  assert.equal(harnessApp.includes("ONBOARDING UX"), true);
  assert.match(
    harnessApp,
    /useState<HarnessScreenId>\(harnessDefaultEntryScreen\(\)\)/
  );

  // Production ProfileReviewScreen untouched by restart helpers
  const productionReview = readFileSync(
    join(root, "src/auth-v2/screens/ProfileReviewScreen.tsx"),
    "utf8"
  );
  assert.equal(productionReview.includes("restartHarnessOnboardingReview"), false);
  assert.equal(productionReview.includes("harnessDefaultEntryScreen"), false);
  assert.equal(productionReview.includes("YouPreview"), false);

  console.log("harnessReviewRestart.test.ts: ok");
}

main();
