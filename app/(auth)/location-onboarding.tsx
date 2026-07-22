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
  clearWizardNavigationSession,
  markBootWizardStep,
  markReviewingWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";

export default function LocationOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("locationFootprint")) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      if (shouldSuppressForwardOnboardingGuardSync("locationFootprint")) {
        if (!cancelled) setReady(true);
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
      if (!user.onboardingIntroSeenAt) {
        if (!cancelled) router.replace("/(auth)/onboarding-intro");
        return;
      }
      const prefs = await loadLocationFootprintPreferences(user.uid);
      if (cancelled || shouldSuppressForwardOnboardingGuardSync("locationFootprint")) {
        return;
      }
      if (prefs.locationConsentShownAt != null) {
        clearWizardNavigationSession();
        router.replace("/(app)/(tabs)/you");
        return;
      }
      markBootWizardStep("locationFootprint", user.uid);
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
    clearWizardNavigationSession();
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
    markReviewingWizardStep("onboardingIntro", user.uid);
    router.replace("/(auth)/onboarding-intro");
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
