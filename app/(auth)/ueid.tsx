import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { UeidReleaseOnboardingScreen } from "@/auth-v2/screens/UeidReleaseOnboardingScreen";
import {
  isReviewingPreviousStep,
  loadOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import { markBootWizardStep } from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";

export default function UeidReleaseScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) router.replace("/");
        return;
      }
      const nav = await loadOnboardingNavigationState();
      if (isReviewingPreviousStep(nav) && nav?.currentStep === "ueidRelease") {
        await markBootWizardStep("ueidRelease", user.uid);
        return;
      }
      if (!user.profileCompletedAt) {
        if (!cancelled) router.replace("/(auth)/complete-profile");
        return;
      }
      if (user.ueidReleasedAt && !isReviewingPreviousStep(nav)) {
        if (!user.onboardingIntroSeenAt) {
          if (!cancelled) router.replace("/(auth)/onboarding-intro");
          return;
        }
        const prefs = await loadLocationFootprintPreferences(user.uid);
        if (!cancelled) {
          router.replace(
            prefs.locationConsentShownAt == null
              ? "/(auth)/location-onboarding"
              : "/(app)/(tabs)/you"
          );
        }
        return;
      }
      await markBootWizardStep("ueidRelease", user.uid);
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
