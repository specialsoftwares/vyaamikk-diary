/**
 * Restrained onboarding motion — presentation only.
 * Respect reduced motion; never delay backend work for animation.
 */

export const ONBOARDING_SCREEN_MS = 250;
/** Success settle AFTER authoritative verify — not a substitute for waiting. */
export const ONBOARDING_SUCCESS_ACK_MS = 420;
export const ONBOARDING_SUCCESS_ACK_REDUCED_MS = 220;
/** Minimum verifying overlay visibility so a fast backend does not flash. */
export const ONBOARDING_MIN_VERIFYING_VISIBLE_MS = 300;
export const ONBOARDING_MIN_VERIFYING_REDUCED_MS = 80;
/**
 * Minimum "Setting up your workspace…" visibility after Confirm & continue.
 * Fast local simulate / cached persist must not batch straight to You.
 */
export const WORKSPACE_SETTING_UP_MIN_MS = 720;
export const WORKSPACE_SETTING_UP_REDUCED_MS = 220;
export const ONBOARDING_FIELD_MS = 160;

/** Profile onboarding only — never shown during phone/email auth. */
export type OnboardingJourneyStage = "profile" | "location";

export const ONBOARDING_JOURNEY_STAGES: readonly OnboardingJourneyStage[] = [
  "profile",
  "location",
] as const;

export function onboardingJourneyLabel(stage: OnboardingJourneyStage): string {
  switch (stage) {
    case "profile":
      return "Profile";
    case "location":
      return "Location";
  }
}
