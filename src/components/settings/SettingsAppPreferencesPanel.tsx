import React, { useMemo } from "react";
import { StyleSheet } from "react-native";

import { GlassSurface } from "@/components/ui";
import { useT } from "@/i18n";
import { spacing, useTheme, useThemedStyles, type ThemeMode } from "@/theme";

import { LanguageSelector } from "./LanguageSelector";
import { SettingsPreferenceRow } from "./SettingsPreferenceRow";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";

/** Appearance and language. Persistence stays in theme storage and `setLang`. */
export function SettingsAppPreferencesPanel() {
  const t = useT();
  const { mode, setMode } = useTheme();

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      card: {
        paddingVertical: 6,
        paddingHorizontal: spacing.sm,
        marginBottom: spacing.lg,
      },
    })
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
    </GlassSurface>
  );
}
