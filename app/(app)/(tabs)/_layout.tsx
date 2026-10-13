import React from "react";
import { Tabs } from "expo-router";

import { DeferredLocationFootprintConsentHost } from "@/components/location/DeferredLocationFootprintConsentHost";
import { DeferredStatutoryPromptHost } from "@/components/statutory/DeferredStatutoryPromptHost";
import { TelemetryConsentHost } from "@/components/telemetry/TelemetryConsentHost";
import { AppTabBar } from "@/navigation/AppTabBar";
import { useT } from "@/i18n";
import { useThemeColors } from "@/theme";

/**
 * Four tabs. The highlighted tab is the navigator's selected route.
 * Android Back returns to the previous tab, then the start tab, and only
 * then leaves the app. Stack screens above the tabs keep their own Back.
 */
export default function TabsLayout() {
  const t = useT();
  const colors = useThemeColors();

  return (
    <>
      <Tabs
        initialRouteName="you"
        backBehavior="history"
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="calendar" options={{ title: t("calendarMaps.tabLabel") }} />
        <Tabs.Screen name="you" options={{ title: t("you.title") }} />
        <Tabs.Screen name="saved-records" options={{ title: t("savedRecords.tabLabel") }} />
        <Tabs.Screen name="settings" options={{ title: t("settings.tabLabel") }} />
      </Tabs>
      <DeferredStatutoryPromptHost />
      <DeferredLocationFootprintConsentHost />
      <TelemetryConsentHost />
    </>
  );
}
