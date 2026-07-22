import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";
import {
  hrefForProfileRemediation,
  resolveProfileRemediation,
} from "@/onboarding/profileRemediation";

/**
 * Ordered onboarding gates after sign-in (local profile flags only).
 * Does not include draft continuation — handled by resolveBootDestination.
 */
export async function resolveAuthOnboardingHref(
  user: UserProfile
): Promise<Href | null> {
  // Legacy / incomplete v2 profile — remediate before dashboard (no flash).
  if (user.profileCompletedAt) {
    const remediation = resolveProfileRemediation(user);
    if (remediation !== "fullyCompliant" && remediation !== "emailRemediationRequired") {
      return hrefForProfileRemediation(remediation);
    }
  }

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
