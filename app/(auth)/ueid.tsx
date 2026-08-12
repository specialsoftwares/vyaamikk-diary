import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { UeidReleaseOnboardingScreen } from "@/auth-v2/screens/UeidReleaseOnboardingScreen";
import {
  markBootWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";
import { isValidUEID } from "@/utils/ueid";

/**
 * Dormant UEID reveal route — no longer a mandatory post-profile gate.
 * Retained for integrity recovery when UEID is missing/malformed, and for
 * any deep-link/historical navigation.
 */
export default function UeidReleaseScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("ueidRelease")) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (shouldSuppressForwardOnboardingGuardSync("ueidRelease")) return;
      if (!user.profileCompletedAt) {
        if (!cancelled) router.replace("/(auth)/complete-profile");
        return;
      }
      // Valid identity → leave dormant reveal; do not chain Intro/Footprint.
      if (user.ueid && isValidUEID(user.ueid)) {
        if (!cancelled) router.replace("/(app)/(tabs)/you");
        return;
      }
      markBootWizardStep("ueidRelease", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user?.profileCompletedAt) {
    return null;
  }

  // Only render integrity surface when UEID is missing/malformed.
  if (user.ueid && isValidUEID(user.ueid)) {
    return null;
  }

  return <UeidReleaseOnboardingScreen user={user} />;
}
