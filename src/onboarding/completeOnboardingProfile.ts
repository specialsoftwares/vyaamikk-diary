/**
 * Atomic onboarding profile completion — single-flight, no optimistic dashboard.
 */

import * as FileSystem from "expo-file-system/legacy";

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import type { OnboardingProfileDraftV2 } from "@/onboarding/profileIdentityModel";
import { persistIssuerIdentitySnapshot } from "@/onboarding/issuerIdentitySnapshot";
import { clearOnboardingProfileDraftV2 } from "@/onboarding/onboardingProfileDraftV2";
import {
  completeOnboardingProfileWithDeps,
  __resetCompleteOnboardingFlightForTests,
  type CompleteOnboardingResult,
} from "@/onboarding/completeOnboardingProfileLogic";

export { __resetCompleteOnboardingFlightForTests };
export type { CompleteOnboardingResult };

export interface CompleteOnboardingInput {
  user: UserProfile;
  draft: OnboardingProfileDraftV2;
  updateProfile: (patch: ProfilePatch) => Promise<UserProfile>;
  now?: number;
}

async function assertDurableLogo(draft: OnboardingProfileDraftV2): Promise<void> {
  const uri = draft.profileLogo?.localUri;
  if (!uri || !draft.logoPersisted) {
    throw new AppError("unknown", "Profile image must be saved before completion.");
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new AppError(
      "unknown",
      "Saved profile image is missing. Please reselect and confirm the image."
    );
  }
}

export async function completeOnboardingProfile(
  input: CompleteOnboardingInput
): Promise<CompleteOnboardingResult> {
  return completeOnboardingProfileWithDeps({
    ...input,
    persistSnapshot: persistIssuerIdentitySnapshot,
    assertDurableLogo,
    clearDraft: clearOnboardingProfileDraftV2,
  });
}
