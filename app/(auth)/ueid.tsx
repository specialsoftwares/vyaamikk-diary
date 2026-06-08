import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { UeidReleaseOnboardingScreen } from "@/auth-v2/screens/UeidReleaseOnboardingScreen";
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
    if (!user.profileCompletedAt) {
      router.replace("/(auth)/complete-profile");
      return;
    }
    if (user.ueidReleasedAt && !user.onboardingIntroSeenAt) {
      router.replace("/(auth)/onboarding-intro");
      return;
    }
    if (user.ueidReleasedAt && user.onboardingIntroSeenAt) {
      void (async () => {
        const prefs = await loadLocationFootprintPreferences(user.uid);
        router.replace(
          prefs.locationConsentShownAt == null
            ? "/(auth)/location-onboarding"
            : "/(app)/(tabs)/you"
        );
      })();
    }
  }, [user, router]);

  if (!user?.profileCompletedAt) {
    return null;
  }

  return <UeidReleaseOnboardingScreen user={user} />;
}
