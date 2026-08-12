import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { VyaamikkIntroSplash } from "@/components/onboarding/VyaamikkIntroSplash";
import { useAuth } from "@/state/auth";
import { markIntroSplashSeen } from "@/services/introSplashStorage";
import {
  clearWizardNavigationSession,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";

/**
 * Dormant Intro route — no longer a mandatory post-profile gate.
 * Normal entry replaces to You without requiring onboardingIntroSeenAt and
 * without chaining GPS footprint onboarding.
 */
export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) return;

      if (!user.profileCompletedAt) {
        if (!cancelled) router.replace("/(auth)/complete-profile");
        return;
      }

      clearWizardNavigationSession();
      if (!cancelled) router.replace("/(app)/(tabs)/you");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Suppress/review edge: allow finishing without Footprint chain.
  if (!user?.profileCompletedAt || !shouldSuppressForwardOnboardingGuardSync("onboardingIntro")) {
    return null;
  }

  const onFinish = async () => {
    if (!user.onboardingIntroSeenAt) {
      await updateProfile({ onboardingIntroSeenAt: Date.now() });
      await markIntroSplashSeen(user.uid);
    }
    clearWizardNavigationSession();
    router.replace("/(app)/(tabs)/you");
  };

  return <VyaamikkIntroSplash onFinish={() => void onFinish()} />;
}
