import React, { useCallback, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";

import { LocationFootprintConsentSheet } from "@/components/location/LocationFootprintConsentSheet";
import { LOCATION_FOOTPRINT_AUTO_PROMPT_ENABLED_V1 } from "@/components/location/locationFootprintAutoPrompt";
import { useAuth } from "@/state/auth";
import {
  saveLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { locationService } from "@/services/location";

/**
 * Location footprint consent host — V1 dormant for auto-prompt.
 * Mounted under the tab shell for capability retention, but does NOT open a
 * sheet merely because profileCompletedAt is set or locationConsentShownAt is
 * missing (including reinstall). Native permission is only requested from an
 * explicit Allow action if/when a later contextual phase re-enables prompting.
 */
export function LocationFootprintConsentHost() {
  const { user } = useAuth();
  // Force closed while V1 auto-prompt is disabled (visible state retained for Allow handlers).
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // V1 contract: after Profile Review → Workspace Ready → You, do NOT auto-open
  // a GPS/location footprint sheet. Missing locationConsentShownAt (including
  // reinstall) must not interrupt the workspace. Host stays mounted/dormant;
  // permission is only requested from an explicit Allow action if this sheet
  // is shown later by a bounded contextual phase — never fake-set shownAt here.
  useFocusEffect(
    useCallback(() => {
      void syncPermission();
    }, [syncPermission])
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
      visible={LOCATION_FOOTPRINT_AUTO_PROMPT_ENABLED_V1 ? visible : false}
      busy={busy}
      onAllow={() => void onAllow()}
      onNotNow={onNotNow}
    />
  );
}
