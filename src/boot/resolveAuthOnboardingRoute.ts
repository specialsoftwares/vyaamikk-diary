import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import {
  hrefForProfileRemediation,
  resolveProfileRemediation,
} from "@/onboarding/profileRemediation";
import { isValidUEID } from "@/utils/ueid";

/**
 * Ordered onboarding gates after sign-in (local profile flags only).
 * Does not include draft continuation — handled by resolveBootDestination.
 *
 * V1 public release: after authoritative profile completion (+ identity integrity),
 * resolve to the app. UEID reveal / Intro / GPS footprint acknowledgements are
 * no longer mandatory blocking gates (fields retained for compatibility).
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

  // Distinguish UEID identity integrity from UEID *reveal acknowledgement*.
  // Missing/malformed UEID is not silently treated as onboarded.
  if (!user.ueid || !isValidUEID(user.ueid)) {
    return "/(auth)/ueid";
  }

  return null;
}
