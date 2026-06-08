import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { format, isToday } from "date-fns";

import { GlassSurface } from "@/components/ui";
import { LanguageSelector } from "./LanguageSelector";
import type { UserProfile } from "@/domain/types";
import type { LocationFootprintPreferences } from "@/domain/locationFootprintPreferences";
import { resolveLoginSubtitle } from "@/services/auth/loginTimestamps";
import {
  loadLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { useI18n, useT } from "@/i18n";
import { spacing, useTheme, useThemedStyles, type ThemeMode } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";
import {
  resolveLocationAccessDisplay,
  type LocationAccessTone,
} from "./settingsLocationAccessLabel";
import type { SettingsPreferenceValueTone } from "./SettingsPreferenceRow";

interface SettingsAccountAppPanelProps {
  user: UserProfile | null;
  sessionLastActive?: number | null;
  onLocationAccessPress: () => void;
}

function formatCompactActiveTimestamp(ms: number, todayLabel: string): string {
  if (isToday(ms)) return `${todayLabel}, ${format(ms, "h:mm a")}`;
  return format(ms, "d MMM, h:mm a");
}

function locationValueTone(tone: LocationAccessTone): SettingsPreferenceValueTone {
  if (tone === "positive") return "positive";
  if (tone === "warning") return "warning";
  if (tone === "muted") return "muted";
  return "default";
}

export function SettingsAccountAppPanel({
  user,
  sessionLastActive,
  onLocationAccessPress,
}: SettingsAccountAppPanelProps) {
  const t = useT();
  const { mode, setMode } = useTheme();
  const [locationPrefs, setLocationPrefs] = useState<LocationFootprintPreferences | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      card: {
        paddingVertical: 6,
        paddingHorizontal: spacing.sm,
        gap: 0,
      },
    })
  );

  const reloadLocation = useCallback(async () => {
    if (!user?.uid) {
      setLocationPrefs(null);
      return;
    }
    await syncLocationFootprintPermissionStatus(user.uid);
    const next = await loadLocationFootprintPreferences(user.uid);
    setLocationPrefs(next);
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void reloadLocation();
    }, [reloadLocation])
  );

  const appearanceOptions = useMemo(
    () =>
      (["system", "light", "dark"] as const).map((id) => ({
        id,
        label: t(
          id === "system"
            ? "settings.appearanceSystem"
            : id === "light"
              ? "settings.appearanceLight"
              : "settings.appearanceDark"
        ),
      })),
    [t]
  );

  const activeMs = useMemo(() => {
    if (user?.lastActiveAt != null && user.lastActiveAt > 0) return user.lastActiveAt;
    if (sessionLastActive != null && sessionLastActive > 0) return sessionLastActive;
    return null;
  }, [user?.lastActiveAt, sessionLastActive]);

  const lastActiveValue = useMemo(() => {
    if (activeMs == null) return t("settings.lastActiveUnknown");
    return formatCompactActiveTimestamp(activeMs, t("settings.lastActiveToday"));
  }, [activeMs, t]);

  const loginSubtitle = resolveLoginSubtitle(user);
  const showFirstSignIn =
    loginSubtitle?.kind === "first_login" && activeMs == null;

  const locationDisplay = resolveLocationAccessDisplay(locationPrefs, t);

  return (
    <GlassSurface style={styles.card}>
      <SettingsPreferenceRow
        dense
        icon="theme-light-dark"
        label={t("settings.appearance")}
        trailing={
          <SettingsSegmentedControl<ThemeMode>
            dense
            options={appearanceOptions}
            value={mode}
            onChange={(next) => void setMode(next)}
            accessibilityLabel={t("settings.appearance")}
          />
        }
      />
      <SettingsPreferenceRow
        dense
        icon="translate"
        label={t("settings.language")}
        trailing={<LanguageSelector />}
      />
      <SettingsPreferenceRow
        dense
        icon="clock-outline"
        label={t("settings.lastActiveLabel")}
        value={showFirstSignIn ? t("settings.firstLoginShort") : lastActiveValue}
        valueTone={showFirstSignIn ? "muted" : "default"}
      />
      <SettingsPreferenceRow
        dense
        icon="map-marker-radius-outline"
        label={t("settings.locationAccess")}
        value={locationDisplay.label}
        valueTone={locationValueTone(locationDisplay.tone)}
        onPress={onLocationAccessPress}
        accessibilityLabel={`${t("settings.locationAccess")}, ${locationDisplay.label}`}
      />
    </GlassSurface>
  );
}
