/**
 * Email OTP success → next onboarding step routing contract.
 * Reproduces Play vc10 stuck state: Email verified chip true, step remains email_verify.
 */
import assert from "node:assert/strict";

import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  canVerifyEmailOtp,
  createEmailOtpSendMachine,
  beginEmailOtpSend,
  completeEmailOtpSend,
} from "@/auth/emailOtpSendMachine";
import {
  __resetWizardNavigationControllerForTests,
  getWizardSnapshot,
  isReviewIntentActive,
  shouldSuppressForwardGuard,
} from "@/auth/wizardNavigationController";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import { resumeWizardStep } from "@/auth/onboardingWizard";
import type { UserProfile } from "@/domain/types";

function reset(): void {
  __resetWizardNavigationControllerForTests();
}

function verifiedEmailProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    uid: "uid-email-success-1",
    phoneE164: "+919876543210",
    businessEmail: "owner@example.com",
    normalizedEmail: "owner@example.com",
    emailStatus: "verified",
    emailVerifiedAt: 1_700_000_000_000,
    emailLinkedAt: 1_700_000_000_000,
    profileCompletedAt: null,
    ueid: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as UserProfile;
}

/**
 * Mirrors AuthFlowGate.goToBusinessIdentity decision after email verify success:
 * review intent blocks; mount-guard must NOT block intentional continue.
 */
function shouldAdvanceAfterEmailVerifySuccess(): boolean {
  return !isReviewIntentActive();
}

async function main(): Promise<void> {
  // --- SUCCESS: email_verify → authoritative verified → advance to businessIdentity ---
  reset();
  markContinuingWizardStep("emailOtp", "uid-email-success-1", {
    phoneE164: "+919876543210",
  });
  assert.equal(getWizardSnapshot().currentLogicalStep, "emailOtp");
  assert.equal(getWizardSnapshot().navigationIntent, "continueForward");
  // Mount guard still true (protects boot/mount steals) …
  assert.equal(shouldSuppressForwardGuard("businessIdentity"), true);
  // … but intentional post-verify advance must ignore that guard.
  assert.equal(shouldAdvanceAfterEmailVerifySuccess(), true);
  assert.equal(hasAuthoritativeVerifiedEmail(verifiedEmailProfile()), true);
  assert.equal(resumeWizardStep(verifiedEmailProfile()), "businessIdentity");

  // Perform the same mark+target AuthFlowGate uses on success.
  markContinuingWizardStep("businessIdentity", "uid-email-success-1", {
    phoneE164: "+919876543210",
    verifiedEmail: "owner@example.com",
  });
  assert.equal(getWizardSnapshot().currentLogicalStep, "businessIdentity");
  assert.equal(getWizardSnapshot().navigationIntent, "continueForward");

  // --- SUCCESS + SLOW COMMIT: profile already verified while memory still emailOtp ---
  reset();
  markContinuingWizardStep("emailOtp", "uid-email-success-1");
  const alreadyVerified = verifiedEmailProfile();
  assert.equal(hasAuthoritativeVerifiedEmail(alreadyVerified), true);
  assert.equal(shouldAdvanceAfterEmailVerifySuccess(), true);
  assert.equal(resumeWizardStep(alreadyVerified), "businessIdentity");

  // --- SUCCESS CLEANUP: resetting send machine disables verify (must happen AFTER advance) ---
  reset();
  let machine = beginEmailOtpSend(createEmailOtpSendMachine());
  const gen = machine.generation;
  machine = completeEmailOtpSend(machine, gen, {
    challengeId: "ch_1",
    expiresAt: Date.now() + 60_000,
    resendAvailableAt: Date.now() + 30_000,
  })!;
  assert.equal(canVerifyEmailOtp(machine), true);
  const afterCleanup = createEmailOtpSendMachine();
  assert.equal(canVerifyEmailOtp(afterCleanup), false);
  // Stranding would look like: chip true + canVerify false + step still emailOtp.
  assert.equal(hasAuthoritativeVerifiedEmail(verifiedEmailProfile()), true);
  assert.equal(canVerifyEmailOtp(afterCleanup), false);

  // --- DOUBLE VERIFY: one CONTINUE to businessIdentity ---
  reset();
  markContinuingWizardStep("emailOtp", "u1");
  markContinuingWizardStep("businessIdentity", "u1");
  markContinuingWizardStep("businessIdentity", "u1");
  assert.equal(getWizardSnapshot().currentLogicalStep, "businessIdentity");

  // --- ALREADY VERIFIED: startup/hydration skips email_verify ---
  reset();
  assert.equal(resumeWizardStep(verifiedEmailProfile()), "businessIdentity");
  assert.notEqual(resumeWizardStep(verifiedEmailProfile()), "emailOtp");
  assert.notEqual(resumeWizardStep(verifiedEmailProfile()), "emailEntry");

  // --- REVIEW intent: must NOT advance over Back ---
  reset();
  markReviewingWizardStep("emailEntry", "u1");
  assert.equal(isReviewIntentActive(), true);
  assert.equal(shouldAdvanceAfterEmailVerifySuccess(), false);

  // --- WRONG / incomplete OTP machine: remains non-verifiable ---
  reset();
  assert.equal(canVerifyEmailOtp(createEmailOtpSendMachine()), false);
  assert.equal(canVerifyEmailOtp(beginEmailOtpSend(createEmailOtpSendMachine())), false);

  console.log("emailSuccessRouting.test.ts: ok");
}

void main();
