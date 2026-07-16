import React, { useCallback, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect, usePathname } from "expo-router";

import { LocationFootprintConsentSheet } from "@/components/location/LocationFootprintConsentSheet";
import { useAuth } from "@/state/auth";
import {
  loadLocationFootprintPreferences,
  markLocationFootprintConsentShown,
  saveLocationFootprintPreferences,
  shouldShowLocationFootprintConsent,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { locationService } from "@/services/location";

const TAB_SEGMENT = /\(tabs\)\/(you|calendar|settings)/;

/**
 * One-time in-app explanation before any native location permission request.
 * Foreground footprints only — never blocks app use.
 */
export function LocationFootprintConsentHost() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const checkingRef = useRef(false);

  const syncPermission = useCallback(async () => {
    if (!user?.uid) return;
    await syncLocationFootprintPermissionStatus(user.uid);
  }, [user?.uid]);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      setBusy(false);
      void syncPermission();
    });
    return () => sub.remove();
  }, [syncPermission]);

  const tryShow = useCallback(async () => {
    if (!user?.profileCompletedAt || !user.ueidReleasedAt || !user.onboardingIntroSeenAt) {
      return;
    }
    if (!user.uid) return;
    if (pathname.includes("composer")) return;
    if (!TAB_SEGMENT.test(pathname)) return;
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const show = await shouldShowLocationFootprintConsent(user.uid);
      if (!show) return;
      setVisible(true);
      await markLocationFootprintConsentShown(user.uid);
    } finally {
      checkingRef.current = false;
    }
  }, [user, pathname]);

  useFocusEffect(
    useCallback(() => {
      void syncPermission();
      const id = setTimeout(() => void tryShow(), 1100);
      return () => clearTimeout(id);
    }, [tryShow, syncPermission])
  );

  const onAllow = useCallback(async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      await saveLocationFootprintPreferences(user.uid, {
        locationFootprintsEnabled: true,
        locationConsentAcceptedAt: Date.now(),
      });
      const status = await locationService.requestPermission();
      await syncLocationFootprintPermissionStatus(user.uid);
      if (status !== "granted") {
        await saveLocationFootprintPreferences(user.uid, {
          locationFootprintsEnabled: true,
        });
      }
    } finally {
      // Dismiss in finally so a hung/rejected permission prompt cannot leave
      // a full-screen Modal capturing tab and content touches.
      setVisible(false);
      setBusy(false);
    }
  }, [user?.uid]);

  const onNotNow = useCallback(() => {
    // Release the Modal synchronously before any AsyncStorage work so a
    // hung write cannot trap touches.
    setVisible(false);
    if (!user?.uid) return;
    void saveLocationFootprintPreferences(user.uid, {
      locationFootprintsEnabled: false,
      locationConsentDeclinedAt: Date.now(),
    });
  }, [user?.uid]);

  return (
    <LocationFootprintConsentSheet
      visible={visible}
      busy={busy}
      onAllow={() => void onAllow()}
      onNotNow={onNotNow}
    />
  );
}
