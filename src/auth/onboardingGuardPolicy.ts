/**
 * Shared helpers for pre-dashboard screen guards — distinguish boot/continue
 * redirects from deliberate earlier-step review.
 */

import type { Href } from "expo-router";

import {
  canVisitWizardStep,
  hrefForWizardStep,
  isPreDashboardOnboardingIncomplete,
  maxAuthorizedWizardStep,
  resumeWizardStep,
  type OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import {
  isReviewingPreviousStep,
  loadOnboardingNavigationState,
  setOnboardingWizardStep,
  type OnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import type { UserProfile } from "@/domain/types";

export async function readWizardNav(): Promise<OnboardingNavigationState | null> {
  return loadOnboardingNavigationState();
}

/**
 * Whether a screen’s continuous useEffect should force-navigate away.
 * Review intent: never force forward. Boot/continue: only if current step
 * is behind the resume target (idempotent compare happens at call site).
 */
export async function shouldSuppressForwardOnboardingGuard(
  screenStep: OnboardingWizardStep
): Promise<boolean> {
  const nav = await loadOnboardingNavigationState();
  if (!isReviewingPreviousStep(nav)) return false;
  if (nav && nav.currentStep === screenStep) return true;
  // Reviewing a different earlier step — this screen shouldn’t steal focus.
  if (nav && canVisitWizardStep(nav.currentStep, screenStep)) return true;
  return isReviewingPreviousStep(nav);
}

export async function markReviewingWizardStep(
  step: OnboardingWizardStep,
  uid: string | null,
  extras?: { phoneE164?: string | null; verifiedEmail?: string | null }
): Promise<void> {
  await setOnboardingWizardStep({
    step,
    intent: "reviewPreviousStep",
    uid,
    phoneE164: extras?.phoneE164,
    verifiedEmail: extras?.verifiedEmail,
  });
}

export async function markContinuingWizardStep(
  step: OnboardingWizardStep,
  uid: string | null,
  extras?: { phoneE164?: string | null; verifiedEmail?: string | null }
): Promise<void> {
  await setOnboardingWizardStep({
    step,
    intent: "continueForward",
    uid,
    phoneE164: extras?.phoneE164,
    verifiedEmail: extras?.verifiedEmail,
  });
}

export async function markBootWizardStep(
  step: OnboardingWizardStep,
  uid: string | null
): Promise<void> {
  await setOnboardingWizardStep({
    step,
    intent: "bootResolution",
    uid,
  });
}

export function dashboardBlockedHref(
  user: UserProfile,
  locationConsentShown: boolean
): Href | null {
  if (!isPreDashboardOnboardingIncomplete(user, { locationConsentShown })) {
    return null;
  }
  const step = resumeWizardStep(user, { locationConsentShown });
  return hrefForWizardStep(step);
}

export function assertStepAllowed(
  requested: OnboardingWizardStep,
  user: UserProfile | null,
  locationConsentShown?: boolean
): boolean {
  const max = maxAuthorizedWizardStep(user, { locationConsentShown });
  return canVisitWizardStep(requested, max);
}
