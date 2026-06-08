import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { VyaamikkIntroSplash } from "@/components/onboarding/VyaamikkIntroSplash";
import { useAuth } from "@/state/auth";
import { markIntroSplashSeen } from "@/services/introSplashStorage";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";

export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (!user.profileCompletedAt) {
      router.replace("/(auth)/complete-profile");
      return;
    }
    if (!user.ueidReleasedAt) {
      router.replace("/(auth)/ueid");
      return;
    }
    if (user.onboardingIntroSeenAt) {
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

  if (!user?.ueidReleasedAt || user.onboardingIntroSeenAt) {
    return null;
  }

  const onFinish = async () => {
    const now = Date.now();
    await updateProfile({ onboardingIntroSeenAt: now });
    await markIntroSplashSeen(user.uid);
    const prefs = await loadLocationFootprintPreferences(user.uid);
    router.replace(
      prefs.locationConsentShownAt == null
        ? "/(auth)/location-onboarding"
        : "/(app)/(tabs)/you"
    );
  };

  return <VyaamikkIntroSplash onFinish={() => void onFinish()} />;
}
