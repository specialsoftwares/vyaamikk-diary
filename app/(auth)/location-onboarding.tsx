import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { LocationFootprintOnboardingScreen } from "@/auth-v2/screens/LocationFootprintOnboardingScreen";
import { useAuth } from "@/state/auth";
import {
  loadLocationFootprintPreferences,
  markLocationFootprintConsentShown,
  saveLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { locationService } from "@/services/location";
import {
  clearOnboardingNavigationState,
  isReviewingPreviousStep,
  loadOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import {
  markBootWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";

export default function LocationOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) router.replace("/");
        return;
      }
      const nav = await loadOnboardingNavigationState();
      const reviewing =
        isReviewingPreviousStep(nav) && nav?.currentStep === "locationFootprint";

      if (!user.profileCompletedAt) {
        if (!cancelled) router.replace("/(auth)/complete-profile");
        return;
      }
      if (!user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      if (!user.onboardingIntroSeenAt) {
        if (!cancelled) router.replace("/(auth)/onboarding-intro");
        return;
      }
      const prefs = await loadLocationFootprintPreferences(user.uid);
      if (prefs.locationConsentShownAt != null && !reviewing) {
        if (!cancelled) {
          await clearOnboardingNavigationState();
          router.replace("/(app)/(tabs)/you");
        }
        return;
      }
      await markBootWizardStep("locationFootprint", user.uid);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (
    !ready ||
    !user?.profileCompletedAt ||
    !user.ueidReleasedAt ||
    !user.onboardingIntroSeenAt
  ) {
    return null;
  }

  const finish = async () => {
    await clearOnboardingNavigationState();
    router.replace("/(app)/(tabs)/you");
  };

  const onAllow = async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      await markLocationFootprintConsentShown(user.uid);
      await saveLocationFootprintPreferences(user.uid, {
        locationFootprintsEnabled: true,
        locationConsentAcceptedAt: Date.now(),
      });
      await locationService.requestPermission();
      await syncLocationFootprintPermissionStatus(user.uid);
    } finally {
      setBusy(false);
      await finish();
    }
  };

  const onNotNow = async () => {
    if (user?.uid) {
      await markLocationFootprintConsentShown(user.uid);
      await saveLocationFootprintPreferences(user.uid, {
        locationFootprintsEnabled: false,
        locationConsentDeclinedAt: Date.now(),
      });
    }
    await finish();
  };

  const onBack = () => {
    void (async () => {
      await markReviewingWizardStep("onboardingIntro", user.uid);
      router.replace("/(auth)/onboarding-intro");
    })();
  };

  return (
    <LocationFootprintOnboardingScreen
      busy={busy}
      onAllow={() => void onAllow()}
      onNotNow={() => void onNotNow()}
      onBack={onBack}
    />
  );
}
