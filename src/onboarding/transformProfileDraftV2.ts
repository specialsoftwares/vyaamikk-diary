/**
 * Transform onboarding draft when switching Individual ↔ Business.
 */

import type { OnboardingAccountKind } from "@/auth/onboardingWizard";
import type { OnboardingProfileDraftV2 } from "@/onboarding/profileIdentityModel";

export function transformProfileDraftV2ForAccountKind(
  draft: OnboardingProfileDraftV2,
  nextKind: OnboardingAccountKind
): { draft: OnboardingProfileDraftV2; clearedMeaningful: boolean } {
  if (draft.accountKind === nextKind) {
    return { draft, clearedMeaningful: false };
  }
  if (nextKind === "individual") {
    const clearedMeaningful = Boolean(
      draft.businessName.trim() ||
        draft.constitution.trim() ||
        draft.gstin.trim()
    );
    return {
      draft: {
        ...draft,
        accountKind: "individual",
        businessName: "",
        constitution: "",
        gstin: "",
        gstinVerificationState: "notProvided",
        // Shared: displayName, PIN, location, logo kept.
        updatedAt: Date.now(),
      },
      clearedMeaningful,
    };
  }
  return {
    draft: {
      ...draft,
      accountKind: "business",
      updatedAt: Date.now(),
    },
    clearedMeaningful: false,
  };
}
