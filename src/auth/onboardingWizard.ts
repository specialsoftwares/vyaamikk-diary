/**
 * Pre-dashboard onboarding wizard — ordered steps independent of server
 * “highest completion” so users can review earlier screens without guards
 * forcibly bouncing them forward.
 */

import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";

/** Steps matching the existing auth + onboarding route tree. */
export type OnboardingWizardStep =
  | "mobileEntry"
  | "phoneConfirm"
  | "phoneOtp"
  | "emailEntry"
  | "emailOtp"
  | "businessIdentity"
  | "profileReview"
  | "ueidRelease"
  | "onboardingIntro"
  | "locationFootprint";

export type OnboardingNavigationIntent =
  | "bootResolution"
  | "continueForward"
  | "reviewPreviousStep";

export const ONBOARDING_WIZARD_STEPS: readonly OnboardingWizardStep[] = [
  "mobileEntry",
  "phoneConfirm",
  "phoneOtp",
  "emailEntry",
  "emailOtp",
  "businessIdentity",
  "profileReview",
  "ueidRelease",
  "onboardingIntro",
  "locationFootprint",
] as const;

export function wizardStepIndex(step: OnboardingWizardStep): number {
  return ONBOARDING_WIZARD_STEPS.indexOf(step);
}

export function wizardStepCount(): number {
  return ONBOARDING_WIZARD_STEPS.length;
}

/**
 * Contextual progress — Account / Identity / Review (no numeric “Step N of M”).
 * `current`/`total` retained as stage ordinals for tests only.
 */
export function wizardProgressLabel(step: OnboardingWizardStep): {
  current: number;
  total: number;
  label: string;
  stage: "account" | "identity" | "review";
} {
  // Lazy import avoided — stage mapping stays local to prevent cycles.
  let stage: "account" | "identity" | "review" = "account";
  if (
    step === "businessIdentity"
  ) {
    stage = "identity";
  } else if (
    step === "profileReview" ||
    step === "ueidRelease" ||
    step === "onboardingIntro" ||
    step === "locationFootprint"
  ) {
    stage = "review";
  }
  const stageIndex = stage === "account" ? 1 : stage === "identity" ? 2 : 3;
  const label =
    stage === "account" ? "Account" : stage === "identity" ? "Identity" : "Review";
  return { current: stageIndex, total: 3, label, stage };
}

/** Ordered previous step in the forward wizard list (not always the Back target). */
export function previousWizardStep(
  step: OnboardingWizardStep
): OnboardingWizardStep | null {
  const i = wizardStepIndex(step);
  if (i <= 0) return null;
  return ONBOARDING_WIZARD_STEPS[i - 1]!;
}

/**
 * Highest step the server-authoritative profile may enter (inclusive).
 * Forward skip beyond this is blocked; reviewing earlier steps is allowed.
 */
export function maxAuthorizedWizardStep(
  user: UserProfile | null,
  opts?: { locationConsentShown?: boolean }
): OnboardingWizardStep {
  if (!user) return "mobileEntry";

  if (!hasAuthoritativeVerifiedEmail(user)) {
    if (user.emailStatus === "verification_pending" && (user.normalizedEmail || user.businessEmail)) {
      return "emailOtp";
    }
    return "emailEntry";
  }

  if (!user.profileCompletedAt) return "businessIdentity";
  if (!user.ueidReleasedAt) return "ueidRelease";
  if (!user.onboardingIntroSeenAt) return "onboardingIntro";
  if (!opts?.locationConsentShown) return "locationFootprint";
  // Fully onboarded — wizard should be cleared; treat location as max.
  return "locationFootprint";
}

/**
 * Cold-launch / boot resume target: earliest incomplete mandatory step.
 */
export function resumeWizardStep(
  user: UserProfile | null,
  opts?: { locationConsentShown?: boolean; phoneChallengePending?: boolean }
): OnboardingWizardStep {
  if (!user) {
    return opts?.phoneChallengePending ? "phoneOtp" : "mobileEntry";
  }
  if (!hasAuthoritativeVerifiedEmail(user)) {
    if (user.emailStatus === "verification_pending" && (user.normalizedEmail || user.businessEmail)) {
      return "emailOtp";
    }
    return "emailEntry";
  }
  if (!user.profileCompletedAt) return "businessIdentity";
  if (!user.ueidReleasedAt) return "ueidRelease";
  if (!user.onboardingIntroSeenAt) return "onboardingIntro";
  if (!opts?.locationConsentShown) return "locationFootprint";
  return "locationFootprint";
}

export function canVisitWizardStep(
  requested: OnboardingWizardStep,
  maxAuthorized: OnboardingWizardStep
): boolean {
  return wizardStepIndex(requested) <= wizardStepIndex(maxAuthorized);
}

/** True when onboarding gates still block the dashboard. */
export function isPreDashboardOnboardingIncomplete(
  user: UserProfile | null,
  opts?: { locationConsentShown?: boolean }
): boolean {
  if (!user) return true;
  if (!hasAuthoritativeVerifiedEmail(user)) return true;
  if (!user.profileCompletedAt) return true;
  if (!user.ueidReleasedAt) return true;
  if (!user.onboardingIntroSeenAt) return true;
  if (!opts?.locationConsentShown) return true;
  return false;
}

export function hrefForWizardStep(step: OnboardingWizardStep): Href {
  switch (step) {
    case "mobileEntry":
    case "phoneConfirm":
    case "phoneOtp":
      return "/(auth)/v2";
    case "emailEntry":
      return { pathname: "/(auth)/v2", params: { step: "email", intent: "review" } };
    case "emailOtp":
      return {
        pathname: "/(auth)/v2",
        params: { step: "email_verify", intent: "review" },
      };
    case "businessIdentity":
      return "/(auth)/complete-profile";
    case "profileReview":
      return "/(auth)/profile-review";
    case "ueidRelease":
      return "/(auth)/ueid";
    case "onboardingIntro":
      return "/(auth)/onboarding-intro";
    case "locationFootprint":
      return "/(auth)/location-onboarding";
    default:
      return "/(auth)/v2";
  }
}

/**
 * Map Expo route + optional query to a wizard step (best-effort).
 */
export function wizardStepFromRoute(
  pathname: string,
  params?: { step?: string; section?: string }
): OnboardingWizardStep | null {
  if (pathname.includes("profile-review")) return "profileReview";
  if (pathname.includes("complete-profile")) return "businessIdentity";
  if (pathname.includes("/ueid")) return "ueidRelease";
  if (pathname.includes("onboarding-intro")) return "onboardingIntro";
  if (pathname.includes("location-onboarding")) return "locationFootprint";
  if (pathname.includes("/v2") || pathname.includes("login")) {
    if (params?.step === "email_verify") return "emailOtp";
    if (params?.step === "email") return "emailEntry";
    return "mobileEntry";
  }
  return null;
}

/**
 * Shared vs identity-specific profile draft fields when switching account kind.
 * Business-only fields are cleared for Individual; Individual keeps shared names.
 */
export type OnboardingAccountKind = "individual" | "business";

export interface OnboardingProfileDraftFields {
  accountKind: OnboardingAccountKind;
  displayName: string;
  businessName: string;
  workType: string;
  designation: string;
}

export function transformProfileDraftForAccountKind(
  draft: OnboardingProfileDraftFields,
  nextKind: OnboardingAccountKind
): { draft: OnboardingProfileDraftFields; clearedMeaningful: boolean } {
  if (draft.accountKind === nextKind) {
    return { draft, clearedMeaningful: false };
  }
  if (nextKind === "individual") {
    const clearedMeaningful = Boolean(
      draft.businessName.trim() || draft.workType.trim() || draft.designation.trim()
    );
    return {
      draft: {
        accountKind: "individual",
        displayName: draft.displayName,
        businessName: "",
        workType: "",
        designation: "",
      },
      clearedMeaningful,
    };
  }
  return {
    draft: { ...draft, accountKind: "business" },
    clearedMeaningful: false,
  };
}

/** Normalize emails for comparison. */
export function sameEmailAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
