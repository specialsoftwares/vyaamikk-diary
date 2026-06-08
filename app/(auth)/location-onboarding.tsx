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

export default function LocationOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

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
    if (!user.onboardingIntroSeenAt) {
      router.replace("/(auth)/onboarding-intro");
      return;
    }
    void (async () => {
      const prefs = await loadLocationFootprintPreferences(user.uid);
      if (prefs.locationConsentShownAt != null) {
        router.replace("/(app)/(tabs)/you");
      }
    })();
  }, [user, router]);

  if (
    !user?.profileCompletedAt ||
    !user.ueidReleasedAt ||
    !user.onboardingIntroSeenAt
  ) {
    return null;
  }

  const finish = () => {
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
      finish();
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
    finish();
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/onboarding-intro");
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
