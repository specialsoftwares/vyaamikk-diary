import type { OnboardingWizardStep } from "@/auth/onboardingWizard";
import {
  ONBOARDING_JOURNEY_STAGES,
  type OnboardingJourneyStage,
} from "@/auth-v2/theme/onboardingMotion";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";

export type IdentityPhase = "details" | "location";

/**
 * Auth steps have no journey chrome.
 * Progress exists only after email verification, on business onboarding.
 */
export function onboardingJourneyStage(
  step: OnboardingWizardStep,
  identityPhase: IdentityPhase = "details"
): OnboardingJourneyStage | null {
  if (step === "businessIdentity") {
    return identityPhase === "location" ? "location" : "profile";
  }
  return null;
}

export function shouldShowOnboardingProgress(step: OnboardingWizardStep): boolean {
  return step === "businessIdentity";
}

export function onboardingJourneyIndex(stage: OnboardingJourneyStage): number {
  return ONBOARDING_JOURNEY_STAGES.indexOf(stage);
}

export function deriveIdentityPhaseFromDraft(input: {
  displayName: string;
  accountKind: string;
  businessName: string;
  constitution?: string;
  confirmedLocationPin: string | null;
  pinCode: string;
}): IdentityPhase {
  const nameReady = input.displayName.trim().length > 0;
  const professional = isIndividualProfessionalPractice(input.constitution ?? "");
  const practiceNamed = professional
    ? input.displayName.trim().length > 0
    : input.businessName.trim().length > 0;
  const businessReady =
    input.accountKind !== "business" ||
    (practiceNamed && (input.constitution ?? "").trim().length > 0);
  const locationDone =
    Boolean(input.confirmedLocationPin) && input.confirmedLocationPin === input.pinCode;
  if (nameReady && businessReady && !locationDone) return "location";
  return "details";
}
