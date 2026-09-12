import React, { useMemo } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";

import { DeferredLocationFootprintConsentHost } from "@/components/location/DeferredLocationFootprintConsentHost";
import { DeferredStatutoryPromptHost } from "@/components/statutory/DeferredStatutoryPromptHost";
import { resolveYouTabIconConcept } from "@/components/you/YouTabIcon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

const YOU_TAB_ICON_NAME = {
  notebook: "book-open-page-variant-outline",
  ledger: "file-document-multiple-outline",
  command: "view-dashboard-outline",
} as const satisfies Record<
  ReturnType<typeof resolveYouTabIconConcept>,
  keyof typeof MaterialCommunityIcons.glyphMap
>;

/**
 * Four-tab shell: Calendar / You / Saved Records / Settings & Info.
 * Native system tab bar (Liquid Glass on iOS 26+, UITabBar / Material 3 on Android).
 *
 * Navigation chrome contract (VYD-23):
 * - Every color on the bar comes from the resolved app theme, per mode. No
 *   hardcoded tints: the old fixed indigo-700 selected tint measured ~2.1:1
 *   against Material 3 dark surfaces (the dark palette brightens primary
 *   for exactly this reason).
 * - `backgroundColor` is set explicitly so the bar matches app surfaces in
 *   both modes instead of the default Material tone.
 * - `labelVisibilityMode="labeled"` (Android): all four destinations keep
 *   concise labels at all times. The Material default ("auto") collapses to
 *   selected-only labels with 4+ destinations, which hid inactive labels and
 *   shifted bar geometry on every selection.
 * - Label sizing intentionally left to the system: a hard-coded fontSize
 *   fought iOS 26 Liquid Glass / Dynamic Type label metrics
 *   (docs/NATIVE_TAB_LAYOUT_AUDIT.md). Colors only.
 * - Contrast pairs are locked by src/layout/tabBarMetrics.contract.test.ts
 *   (labels >= 4.5:1, icons >= 3:1 in both themes).
 */
export default function TabsLayout() {
  const t = useT();
  const { resolvedMode, colors } = useTheme();
  const youIconName = YOU_TAB_ICON_NAME[resolveYouTabIconConcept()];

  const navigationTheme = useMemo(
    () =>
      resolvedMode === "dark"
        ? {
            ...DarkTheme,
            colors: {
              ...DarkTheme.colors,
              background: colors.background,
              card: colors.surface,
            },
          }
        : {
            ...DefaultTheme,
            colors: {
              ...DefaultTheme.colors,
              background: colors.background,
              card: colors.surface,
            },
          },
    [resolvedMode, colors.background, colors.surface]
  );

  return (
    <>
      <NavigationThemeProvider value={navigationTheme}>
        <NativeTabs
          tintColor={colors.primary}
          backgroundColor={colors.surface}
          iconColor={{ default: colors.textMuted, selected: colors.primary }}
          labelVisibilityMode="labeled"
          indicatorColor={colors.primaryLight}
          rippleColor={colors.primaryLight}
          labelStyle={{
            default: { color: colors.textMuted },
            selected: { color: colors.primary },
          }}
        >
          <NativeTabs.Trigger name="calendar">
            <Label>{t("calendarMaps.tabLabel")}</Label>
            <Icon
              src={
                <VectorIcon family={MaterialCommunityIcons} name="calendar-month-outline" />
              }
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="you">
            <Label>{t("you.title")}</Label>
            <Icon src={<VectorIcon family={MaterialCommunityIcons} name={youIconName} />} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="saved-records">
            <Label>{t("savedRecords.tabLabel")}</Label>
            <Icon src={<VectorIcon family={MaterialCommunityIcons} name="archive-outline" />} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="settings">
            <Label>{t("settings.tabLabel")}</Label>
            <Icon src={<VectorIcon family={MaterialCommunityIcons} name="tune-variant" />} />
          </NativeTabs.Trigger>
        </NativeTabs>
      </NavigationThemeProvider>
      <DeferredStatutoryPromptHost />
      <DeferredLocationFootprintConsentHost />
    </>
  );
}
