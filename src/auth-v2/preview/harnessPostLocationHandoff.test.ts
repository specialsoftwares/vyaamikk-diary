import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { isOnboardingUxPreviewEnabled } from "@/auth-v2/preview/onboardingPreviewGate";
import {
  harnessAvoidsProductionProfileWrite,
  harnessEditorCommitDestination,
  harnessProfileConfirmSideEffectKind,
  nextHarnessScreenAfterIdentityContinue,
  nextHarnessScreenAfterReviewConfirm,
  nextHarnessScreenAfterWorkspaceReadySettle,
  productionProfileReviewUsesAuthoritativeCompletion,
  shouldNavigateHarnessYouAfterWorkspaceReady,
  simulateHarnessProfileCompletion,
} from "@/auth-v2/preview/harnessPostLocationHandoff";

const root = join(__dirname, "../../..");

async function main() {
  // A + B: Location Continue → Review, no production write path
  assert.equal(nextHarnessScreenAfterIdentityContinue("details"), "location");
  assert.equal(nextHarnessScreenAfterIdentityContinue("location"), "profile_review");
  assert.notEqual(nextHarnessScreenAfterIdentityContinue("location"), "location");

  assert.equal(harnessProfileConfirmSideEffectKind(), "preview_local_simulate");
  assert.notEqual(
    harnessProfileConfirmSideEffectKind(),
    "production_completeOnboardingProfile"
  );

  // C + D: Preview confirm is local simulate → ready (with restrained latency)
  const simulatedStarted = Date.now();
  const simulated = await simulateHarnessProfileCompletion();
  assert.equal(simulated, "ready");
  assert.ok(
    Date.now() - simulatedStarted >= 400,
    "harness simulate must not be instantaneous (protects Workspace Ready visibility)"
  );

  // Review confirm must enter workspace setup — never You in one hop
  assert.equal(nextHarnessScreenAfterReviewConfirm(), "workspace_setting_up");
  assert.notEqual(nextHarnessScreenAfterReviewConfirm(), "you_preview");
  assert.equal(nextHarnessScreenAfterWorkspaceReadySettle(), "you_preview");
  assert.equal(harnessEditorCommitDestination(), "profile_review");
  assert.notEqual(harnessEditorCommitDestination(), "you_preview");

  // E: exactly-once toward preview You
  assert.equal(
    shouldNavigateHarnessYouAfterWorkspaceReady({
      phase: "ready",
      alreadyNavigated: false,
    }),
    true
  );
  assert.equal(
    shouldNavigateHarnessYouAfterWorkspaceReady({
      phase: "ready",
      alreadyNavigated: true,
    }),
    false
  );
  assert.equal(
    shouldNavigateHarnessYouAfterWorkspaceReady({
      phase: "preparing",
      alreadyNavigated: false,
    }),
    false,
    "premature You navigation during preparing is forbidden"
  );

  // F: Production Profile Review still uses authoritative completion
  const productionReview = readFileSync(
    join(root, "src/auth-v2/screens/ProfileReviewScreen.tsx"),
    "utf8"
  );
  assert.equal(
    productionProfileReviewUsesAuthoritativeCompletion(productionReview),
    true
  );
  assert.equal(productionReview.includes("completeOnboardingProfile"), true);
  assert.equal(productionReview.includes('router.replace("/(app)/(tabs)/you")'), true);

  // A/C harness source isolation
  const harnessApp = readFileSync(
    join(root, "tools/onboarding-ux-harness/src/HarnessApp.tsx"),
    "utf8"
  );
  assert.equal(harnessAvoidsProductionProfileWrite(harnessApp), true);
  assert.equal(harnessApp.includes("completeOnboardingProfile"), false);
  assert.equal(harnessApp.includes("ReviewSectionEditPreview"), true);
  assert.equal(harnessApp.includes("review_edit"), true);
  assert.equal(
    harnessApp.includes('setScreen("identity")') &&
      harnessApp.includes("onEdit={(section") &&
      !harnessApp.includes("ReviewSectionEditPreview"),
    false,
    "Review Edit must not fall through to identity→location wizard"
  );
  assert.equal(
    harnessApp.includes("Location confirmed. No production profile write."),
    false,
    "blocking Preview alert must be removed from Location Continue"
  );
  assert.equal(harnessApp.includes("profile_review"), true);
  assert.equal(harnessApp.includes("simulateHarnessProfileCompletion"), true);
  assert.equal(harnessApp.includes("ProfileReviewPresentation"), true);
  assert.equal(harnessApp.includes("you_preview"), true);
  assert.equal(harnessApp.includes("onReviewSuccessNavigate"), true);
  assert.equal(harnessApp.includes("shouldNavigateHarnessYouAfterWorkspaceReady"), true);
  assert.equal(harnessApp.includes("Restart onboarding review"), true);
  assert.equal(harnessApp.includes("harnessDefaultEntryScreen"), true);
  assert.equal(harnessApp.includes("reviewJourneyKey"), true);
  assert.equal(harnessApp.includes("AsyncStorage"), false);
  assert.match(
    harnessApp,
    /useState<HarnessScreenId>\(harnessDefaultEntryScreen\(\)\)/
  );
  assert.equal(
    /onConfirmPersist=\{async \(\) => \{[\s\S]*?setScreen\("you_preview"\)/.test(harnessApp),
    false,
    "Confirm persist must not navigate directly to You"
  );
  assert.equal(
    /onSave=\{\(patch\) => \{[\s\S]*?setScreen\("you_preview"\)/.test(harnessApp),
    false,
    "editor onSave must not navigate to You"
  );
  assert.equal(harnessApp.includes("/(auth)/ueid"), false);
  assert.equal(harnessApp.includes("onboarding-intro"), false);
  assert.equal(harnessApp.includes("location-onboarding"), false);

  // H: Preview cannot activate in production store/standalone
  const prev = process.env.EXPO_PUBLIC_APP_MODE;
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  try {
    assert.equal(isOnboardingUxPreviewEnabled(), false);
  } finally {
    __setRuntimeSignalsForTests(null);
    if (prev == null) delete process.env.EXPO_PUBLIC_APP_MODE;
    else process.env.EXPO_PUBLIC_APP_MODE = prev;
  }

  console.log("harnessPostLocationHandoff.test.ts: ok");
}

void main();
