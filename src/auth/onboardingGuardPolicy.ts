/**
 * Shared helpers for pre-dashboard screen guards — distinguish boot/continue
 * redirects from deliberate earlier-step review.
 *
 * Canonical owner: wizardNavigationController (in-memory, synchronous).
 * AsyncStorage persistence is secondary and must not gate review decisions.
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
  type OnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import {
  dispatchWizardNav,
  getWizardSnapshot,
  isReviewIntentActive,
  shouldSuppressForwardGuard,
} from "@/auth/wizardNavigationController";
import type { UserProfile } from "@/domain/types";

export async function readWizardNav(): Promise<OnboardingNavigationState | null> {
  const snap = getWizardSnapshot();
  if (snap.hasActiveSession) {
    return {
      uid: snap.uid,
      currentStep: snap.currentLogicalStep,
      intent: snap.navigationIntent,
      phoneE164: snap.phoneE164,
      verifiedEmail: snap.verifiedEmail,
      updatedAt: snap.updatedAt,
    };
  }
  return loadOnboardingNavigationState();
}

/**
 * Whether a screen’s continuous useEffect should force-navigate away.
 * Sync-first: in-memory review / in-flight transition always wins.
 */
export function shouldSuppressForwardOnboardingGuardSync(
  screenStep: OnboardingWizardStep
): boolean {
  return shouldSuppressForwardGuard(screenStep);
}

/** @deprecated Prefer sync variant — kept for call sites still awaiting. */
export async function shouldSuppressForwardOnboardingGuard(
  screenStep: OnboardingWizardStep
): Promise<boolean> {
  if (shouldSuppressForwardGuard(screenStep)) return true;
  const nav = await loadOnboardingNavigationState();
  if (!isReviewingPreviousStep(nav)) return false;
  if (nav && nav.currentStep === screenStep) return true;
  if (nav && canVisitWizardStep(nav.currentStep, screenStep)) return true;
  return isReviewingPreviousStep(nav);
}

/**
 * Mark review intent synchronously in memory, then persist in background.
 * Callers must router.replace only when the returned shouldNavigate is true
 * (or use the returned href).
 */
export function markReviewingWizardStep(
  step: OnboardingWizardStep,
  uid: string | null,
  extras?: { phoneE164?: string | null; verifiedEmail?: string | null }
): void {
  dispatchWizardNav({
    type: "REVIEW",
    step,
    uid,
    phoneE164: extras?.phoneE164,
    verifiedEmail: extras?.verifiedEmail,
  });
}

export function markContinuingWizardStep(
  step: OnboardingWizardStep,
  uid: string | null,
  extras?: { phoneE164?: string | null; verifiedEmail?: string | null }
): void {
  dispatchWizardNav({
    type: "CONTINUE",
    step,
    uid,
    phoneE164: extras?.phoneE164,
    verifiedEmail: extras?.verifiedEmail,
  });
}

export function markBootWizardStep(
  step: OnboardingWizardStep,
  uid: string | null
): void {
  dispatchWizardNav({
    type: "BOOT",
    step,
    uid,
  });
}

/** Clears in-memory session and secondary persistence. */
export function clearWizardNavigationSession(): void {
  dispatchWizardNav({ type: "CLEAR" });
}

/** Sync review check — memory first. */
export function isActivelyReviewingWizardStep(): boolean {
  return isReviewIntentActive();
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
