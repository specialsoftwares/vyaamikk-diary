import React, { useMemo } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  PROFILE_SALUTATION_CHOICE_IDS,
  PROFILE_SALUTATION_IDS,
  type ProfileSalutationId,
} from "@/domain/profileSalutation";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface SalutationPickerProps {
  value: ProfileSalutationId;
  onChange: (value: ProfileSalutationId) => void;
  error?: string | null;
  /** Compact executive row for onboarding — no label, hint, or "none". */
  variant?: "settings" | "executive";
  includeNone?: boolean;
  accessibilityLabel?: string;
}

export function SalutationPicker({
  value,
  onChange,
  error,
  variant = "settings",
  includeNone,
  accessibilityLabel,
}: SalutationPickerProps) {
  const t = useT();
  const executive = variant === "executive";
  const showNone = includeNone ?? !executive;

  const options = useMemo(
    () => (showNone ? PROFILE_SALUTATION_IDS : PROFILE_SALUTATION_CHOICE_IDS),
    [showNone]
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: executive ? 0 : spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted },
      hint: { ...typography.caption, color: c.textSubtle, lineHeight: 18 },
      row: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
      },
      rowExecutive: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        padding: 3,
      },
      executiveTrack: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chip: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surface,
      },
      chipExecutive: {
        paddingVertical: 6,
        paddingHorizontal: spacing.sm + 2,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: "transparent",
        minWidth: 38,
        alignItems: "center",
      },
      chipActive: {
        borderColor: c.primary,
        backgroundColor: c.primaryLight,
      },
      chipExecutiveActive: {
        borderColor: c.primary,
        backgroundColor: c.surface,
      },
      chipText: { ...typography.captionStrong, color: c.textMuted },
      chipTextExecutive: { ...typography.micro, color: c.textMuted, letterSpacing: 0.2 },
      chipTextActive: { color: c.primaryDark },
      chipTextExecutiveActive: { ...typography.micro, color: c.text, fontWeight: "600" },
      err: { ...typography.caption, color: c.danger, marginTop: spacing.xs },
    })
  );

  const chipNodes = options.map((id) => {
    const active = value === id;
    return (
      <Pressable
        key={id}
        onPress={() => onChange(id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        style={[
          executive ? styles.chipExecutive : styles.chip,
          active ? (executive ? styles.chipExecutiveActive : styles.chipActive) : null,
        ]}
      >
        <LocaleUiText
          style={[
            executive ? styles.chipTextExecutive : styles.chipText,
            active
              ? executive
                ? styles.chipTextExecutiveActive
                : styles.chipTextActive
              : null,
          ]}
        >
          {t(`profile.salutation.${id}`)}
        </LocaleUiText>
      </Pressable>
    );
  });

  return (
    <View style={styles.wrap}>
      {!executive ? (
        <>
          <LocaleUiText style={styles.label}>{t("profile.salutation.label")}</LocaleUiText>
          <LocaleUiText style={styles.hint}>{t("profile.salutation.hint")}</LocaleUiText>
          <View style={styles.row} accessibilityRole="radiogroup">
            {chipNodes}
          </View>
        </>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.executiveTrack}
          contentContainerStyle={styles.rowExecutive}
          accessibilityRole="radiogroup"
          accessibilityLabel={accessibilityLabel}
        >
          {chipNodes}
        </ScrollView>
      )}
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}
