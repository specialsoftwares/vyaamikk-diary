/**
 * Race-focused integration tests for the canonical wizard navigation controller.
 * Reproduces: hydration before/during/after Back; late persistence; mount guards
 * during review; stale transition generations; progress bound to visible step.
 */
import assert from "node:assert/strict";

import {
  __resetWizardNavigationControllerForTests,
  dispatchWizardNav,
  getWizardSnapshot,
  isReviewIntentActive,
  isStaleTransitionGeneration,
  logicalBackTarget,
  shouldSuppressForwardGuard,
  wizardProgressStage,
  wizardStageHeading,
  wizardStageModel,
} from "./wizardNavigationController";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "./onboardingGuardPolicy";
import { wizardProgressLabel } from "./onboardingWizard";

function reset(): void {
  __resetWizardNavigationControllerForTests();
}

// --- Deterministic Back map ---
reset();
assert.equal(logicalBackTarget("profileReview"), "businessIdentity");
assert.equal(logicalBackTarget("businessIdentity"), "emailEntry");
assert.equal(logicalBackTarget("emailOtp"), "emailEntry");
assert.equal(logicalBackTarget("emailEntry"), "phoneOtp");
assert.equal(logicalBackTarget("phoneOtp"), "phoneConfirm");
assert.equal(logicalBackTarget("phoneConfirm"), "mobileEntry");
assert.equal(logicalBackTarget("mobileEntry"), null);

// --- Sync review before any async work ---
reset();
markContinuingWizardStep("businessIdentity", "u1", { phoneE164: "+919876543210" });
assert.equal(getWizardSnapshot().currentLogicalStep, "businessIdentity");
assert.equal(getWizardSnapshot().navigationIntent, "continueForward");

// Back from profile → email: intent is reviewPreviousStep SYNCHRONOUSLY
const back = dispatchWizardNav({
  type: "BACK",
  from: "businessIdentity",
  uid: "u1",
});
assert.equal(back.targetStep, "emailEntry");
assert.equal(back.snapshot.navigationIntent, "reviewPreviousStep");
assert.equal(isReviewIntentActive(), true);
assert.equal(shouldSuppressForwardGuard("businessIdentity"), true);
assert.equal(shouldSuppressForwardOnboardingGuardSync("emailEntry"), true);

// AuthFlowGate / complete-profile must NOT forward while reviewing
assert.equal(shouldSuppressForwardGuard("businessIdentity"), true);

// --- Hydration race: late persistence must not override active review ---
reset();
markReviewingWizardStep("emailEntry", "u1");
const genAtReview = getWizardSnapshot().transitionGeneration;
assert.equal(isReviewIntentActive(), true);

// Simulate late AsyncStorage load claiming continueForward to businessIdentity
const late = dispatchWizardNav({
  type: "HYDRATE_PERSISTENCE",
  expectedGeneration: genAtReview,
  state: {
    uid: "u1",
    currentStep: "businessIdentity",
    intent: "continueForward",
    phoneE164: "+919876543210",
    verifiedEmail: "a@b.co",
    updatedAt: Date.now() - 10_000,
  },
});
assert.equal(late.shouldNavigate, false);
assert.equal(getWizardSnapshot().currentLogicalStep, "emailEntry");
assert.equal(getWizardSnapshot().navigationIntent, "reviewPreviousStep");
assert.equal(isReviewIntentActive(), true);

// --- Stale generation rejected ---
reset();
const first = dispatchWizardNav({ type: "CONTINUE", step: "emailEntry", uid: "u1" });
const second = dispatchWizardNav({ type: "REVIEW", step: "mobileEntry", uid: "u1" });
assert.ok(second.generation > first.generation);
assert.equal(isStaleTransitionGeneration(first.generation), true);
assert.equal(isStaleTransitionGeneration(second.generation), false);

const staleHydrate = dispatchWizardNav({
  type: "HYDRATE_PERSISTENCE",
  expectedGeneration: first.generation,
  state: {
    uid: "u1",
    currentStep: "businessIdentity",
    intent: "bootResolution",
    phoneE164: null,
    verifiedEmail: null,
    updatedAt: Date.now(),
  },
});
assert.equal(staleHydrate.shouldNavigate, false);
assert.equal(getWizardSnapshot().currentLogicalStep, "mobileEntry");
assert.equal(getWizardSnapshot().navigationIntent, "reviewPreviousStep");

// --- Boot must not override active review ---
reset();
markReviewingWizardStep("emailEntry", "u1");
const boot = dispatchWizardNav({ type: "BOOT", step: "businessIdentity", uid: "u1" });
assert.equal(boot.shouldNavigate, false);
assert.equal(boot.suppressForwardGuards, true);
assert.equal(getWizardSnapshot().currentLogicalStep, "emailEntry");
assert.equal(getWizardSnapshot().navigationIntent, "reviewPreviousStep");

// --- Exactly one logical Back from email OTP ---
reset();
markContinuingWizardStep("emailOtp", "u1");
const otpBack = dispatchWizardNav({ type: "BACK", from: "emailOtp", uid: "u1" });
assert.equal(otpBack.targetStep, "emailEntry");
assert.equal(otpBack.snapshot.navigationIntent, "reviewPreviousStep");

// --- Email verify success must not be blocked by mount-guard semantics ---
// continueForward@emailOtp makes shouldSuppressForwardGuard(businessIdentity)=true
// (correct for boot/mount steals). Intentional post-verify continue must still
// mark businessIdentity and navigate — AuthFlowGate.goToBusinessIdentity uses
// isReviewIntentActive only, not shouldSuppressForwardGuard.
reset();
markContinuingWizardStep("emailOtp", "u1");
assert.equal(shouldSuppressForwardGuard("businessIdentity"), true);
assert.equal(isReviewIntentActive(), false);
markContinuingWizardStep("businessIdentity", "u1", {
  verifiedEmail: "owner@example.com",
});
assert.equal(getWizardSnapshot().currentLogicalStep, "businessIdentity");
assert.equal(getWizardSnapshot().navigationIntent, "continueForward");

// --- Progress from visible logical step only (no Step N of M) ---
reset();
assert.equal(wizardProgressStage("emailEntry"), "account");
assert.equal(wizardStageHeading("emailEntry"), "Account");
assert.equal(wizardProgressStage("businessIdentity"), "identity");
assert.equal(wizardStageHeading("businessIdentity"), "Identity");
assert.equal(wizardProgressStage("profileReview"), "review");
assert.equal(wizardStageHeading("profileReview"), "Review");

const emailProgress = wizardProgressLabel("emailEntry");
assert.equal(emailProgress.label, "Account");
assert.ok(!emailProgress.label.toLowerCase().includes("step"));
assert.equal(emailProgress.stage, "account");

const profileProgress = wizardProgressLabel("businessIdentity");
assert.equal(profileProgress.label, "Identity");
assert.ok(!/\bStep\s+\d+\s+of\s+\d+\b/i.test(profileProgress.label));

const model = wizardStageModel("emailEntry");
assert.equal(model.stages.length, 3);
assert.equal(model.stages[0]!.active, true);
assert.equal(model.stages[1]!.active, false);
assert.equal(model.stages[2]!.active, false);

// Visible email step must never report Identity/Review as active heading
assert.notEqual(wizardStageHeading("emailEntry"), "Identity");
assert.notEqual(wizardStageHeading("emailEntry"), "Review");

// --- Cold hydrate allowed when memory empty ---
reset();
const coldGen = getWizardSnapshot().transitionGeneration;
const cold = dispatchWizardNav({
  type: "HYDRATE_PERSISTENCE",
  expectedGeneration: coldGen,
  state: {
    uid: "u1",
    currentStep: "emailEntry",
    intent: "reviewPreviousStep",
    phoneE164: "+919876543210",
    verifiedEmail: "a@b.co",
    updatedAt: Date.now(),
  },
});
assert.equal(cold.suppressForwardGuards, true);
assert.equal(getWizardSnapshot().currentLogicalStep, "emailEntry");
assert.equal(isReviewIntentActive(), true);

// Mount guards during review of email must suppress profile / app layout forwards
assert.equal(shouldSuppressForwardOnboardingGuardSync("businessIdentity"), true);
assert.equal(shouldSuppressForwardOnboardingGuardSync("profileReview"), true);

console.log("wizardNavigationController.race.test.ts: ok");
