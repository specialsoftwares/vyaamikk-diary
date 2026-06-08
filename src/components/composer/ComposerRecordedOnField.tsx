import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import { formDateRowStyle } from "@/theme/formLayer";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { useT } from "@/i18n";

interface ComposerRecordedOnFieldProps {
  /** Entry `createdAt` or other system-maintained date — never editable. */
  recordedAtMs: number;
  label?: string;
  hint?: string;
}

/** Read-only system timestamp for cash (and similar) records. */
export function ComposerRecordedOnField({
  recordedAtMs,
  label,
  hint,
}: ComposerRecordedOnFieldProps) {
  const t = useT();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      label: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginBottom: spacing.xs + 2,
        fontWeight: "700",
      },
      row: {
        ...formDateRowStyle(isDark, c),
        marginBottom: spacing.sm,
      },
      value: { ...typography.body, color: c.text },
      hint: { ...typography.caption, color: c.textSubtle, marginTop: spacing.xs },
    })
  );

  return (
    <View>
      <LocaleUiText style={styles.label}>{label ?? t("composer.recordedOn")}</LocaleUiText>
      <View style={styles.row}>
        <Text style={styles.value}>{formatEntryDate(recordedAtMs)}</Text>
      </View>
      <LocaleUiText style={styles.hint}>{hint ?? t("composer.recordedOnHint")}</LocaleUiText>
    </View>
  );
}
