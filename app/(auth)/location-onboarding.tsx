import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { LocationFootprintOnboardingScreen } from "@/auth-v2/screens/LocationFootprintOnboardingScreen";
import { useAuth } from "@/state/auth";
import {
  markLocationFootprintConsentShown,
  saveLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { locationService } from "@/services/location";
import {
  clearWizardNavigationSession,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";

/**
 * Dormant GPS footprint onboarding — no longer a mandatory post-profile gate.
 * Normal entry replaces to You without requiring locationConsentShownAt.
 * Contextual consent remains available via LocationFootprintConsentHost.
 */
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

      // V1: GPS footprint is not mandatory — leave dormant route.
      clearWizardNavigationSession();
      if (!cancelled) router.replace("/(app)/(tabs)/you");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!ready || !user?.profileCompletedAt) {
    return null;
  }

  if (!shouldSuppressForwardOnboardingGuardSync("locationFootprint")) {
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
    clearWizardNavigationSession();
    router.replace("/(app)/(tabs)/you");
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
