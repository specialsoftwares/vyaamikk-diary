import React, { useMemo } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarMapsTabIcon } from "@/components/calendarMaps/CalendarMapsTabIcon";
import { DeferredLocationFootprintConsentHost } from "@/components/location/DeferredLocationFootprintConsentHost";
import { DeferredStatutoryPromptHost } from "@/components/statutory/DeferredStatutoryPromptHost";
import { SettingsInfoTabIcon } from "@/components/settings/SettingsInfoTabIcon";
import { SavedRecordsTabIcon } from "@/components/savedRecords/SavedRecordsTabIcon";
import { YouTabIcon } from "@/components/you/YouTabIcon";
import { GlassTabBarBackdrop } from "@/components/ui/GlassSurface";
import { computeTabBarMetrics } from "@/layout/tabBar";
import { typography, useThemeColors } from "@/theme";
import { useT } from "@/i18n";

/**
 * Four-tab shell: Calendar & Maps / You / Saved Records / Settings & Info.
 * Statutory information lives under Settings & Info (legacy tab route redirects).
 */
export default function TabsLayout() {
  const t = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBar = useMemo(() => computeTabBarMetrics(insets.bottom), [insets.bottom]);

  return (
    <>
    <Tabs
      initialRouteName="you"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { ...typography.micro, fontSize: 11 },
        tabBarBackground: () => <GlassTabBarBackdrop />,
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: tabBar.height,
          paddingTop: tabBar.paddingTop,
          paddingBottom: tabBar.paddingBottom,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("calendarMaps.tabLabel"),
          tabBarIcon: ({ color, focused }) => (
            <CalendarMapsTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: t("you.title"),
          tabBarIcon: ({ color, focused }) => <YouTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="saved-records"
        options={{
          title: t("savedRecords.tabLabel"),
          tabBarIcon: ({ color, focused }) => (
            <SavedRecordsTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings.tabLabel"),
          tabBarIcon: ({ color, focused }) => (
            <SettingsInfoTabIcon color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
    <DeferredStatutoryPromptHost />
    <DeferredLocationFootprintConsentHost />
    </>
  );
}

