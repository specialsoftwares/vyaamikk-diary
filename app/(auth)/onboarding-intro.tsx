import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { VyaamikkIntroSplash } from "@/components/onboarding/VyaamikkIntroSplash";
import { useAuth } from "@/state/auth";
import { markIntroSplashSeen } from "@/services/introSplashStorage";
import { loadLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";
import {
  clearWizardNavigationSession,
  markBootWizardStep,
  markContinuingWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";

export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [allowRender, setAllowRender] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) {
      setAllowRender(true);
      return;
    }
    let cancelled = false;
    (async () => {
      if (shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) {
        if (!cancelled) setAllowRender(true);
        return;
      }

      if (!user.profileCompletedAt) {
        if (!cancelled) router.replace("/(auth)/complete-profile");
        return;
      }
      if (!user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      if (user.onboardingIntroSeenAt) {
        const prefs = await loadLocationFootprintPreferences(user.uid);
        if (cancelled || shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) {
          return;
        }
        router.replace(
          prefs.locationConsentShownAt == null
            ? "/(auth)/location-onboarding"
            : "/(app)/(tabs)/you"
        );
        return;
      }
      markBootWizardStep("onboardingIntro", user.uid);
      if (!cancelled) setAllowRender(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user?.ueidReleasedAt || !allowRender) {
    return null;
  }

  const onFinish = async () => {
    const now = Date.now();
    await updateProfile({ onboardingIntroSeenAt: now });
    await markIntroSplashSeen(user.uid);
    const prefs = await loadLocationFootprintPreferences(user.uid);
    if (prefs.locationConsentShownAt == null) {
      markContinuingWizardStep("locationFootprint", user.uid);
      router.replace("/(auth)/location-onboarding");
      return;
    }
    clearWizardNavigationSession();
    router.replace("/(app)/(tabs)/you");
  };

  return <VyaamikkIntroSplash onFinish={() => void onFinish()} />;
}
