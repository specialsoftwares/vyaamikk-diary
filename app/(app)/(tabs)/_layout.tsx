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

/** Brand indigo active tab tint — matches executive layer / native tab spec. */
const TAB_ACTIVE_TINT = "#4338CA";

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
          tintColor={TAB_ACTIVE_TINT}
          iconColor={colors.textMuted}
          labelStyle={{
            default: { color: colors.textMuted, fontSize: 11 },
            selected: { color: TAB_ACTIVE_TINT, fontSize: 11 },
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
