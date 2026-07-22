import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { UeidReleaseOnboardingScreen } from "@/auth-v2/screens/UeidReleaseOnboardingScreen";
import {
  markBootWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";

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
      if (user.ueidReleasedAt) {
        if (!user.onboardingIntroSeenAt) {
          if (!cancelled) router.replace("/(auth)/onboarding-intro");
          return;
        }
        const prefs = await loadLocationFootprintPreferences(user.uid);
        if (cancelled || shouldSuppressForwardOnboardingGuardSync("ueidRelease")) return;
        router.replace(
          prefs.locationConsentShownAt == null
            ? "/(auth)/location-onboarding"
            : "/(app)/(tabs)/you"
        );
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

  return <UeidReleaseOnboardingScreen user={user} />;
}
