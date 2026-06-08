import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";

/**
 * Ordered onboarding gates after sign-in (local profile flags only).
 * Does not include draft continuation — handled by resolveBootDestination.
 */
export async function resolveAuthOnboardingHref(
  user: UserProfile
): Promise<Href | null> {
  if (!user.profileCompletedAt) {
    return "/(auth)/complete-profile";
  }

  if (!user.ueidReleasedAt) {
    return "/(auth)/ueid";
  }

  if (!user.onboardingIntroSeenAt) {
    return "/(auth)/onboarding-intro";
  }

  const locPrefs = await loadLocationFootprintPreferences(user.uid);
  if (locPrefs.locationConsentShownAt == null) {
    return "/(auth)/location-onboarding";
  }

  return null;
}
