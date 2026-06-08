import React, { useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { Control, FieldErrors } from "react-hook-form";
import { Controller } from "react-hook-form";

import { formDateRowStyle } from "@/theme/formLayer";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { useT } from "@/i18n";
import { translateFormMessage } from "@/utils/i18n/translateFormMessage";

interface ComposerDateFieldProps {
  control: Control<Record<string, unknown>>;
  name: string;
  label: string;
  errors?: FieldErrors;
  errorMessage?: string | null;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function ComposerDateField({
  control,
  name,
  label,
  errors,
  errorMessage,
  minimumDate,
  maximumDate,
}: ComposerDateFieldProps) {
  const t = useT();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const [open, setOpen] = useState(false);
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
      link: { ...typography.captionStrong, color: c.primary },
      err: { ...typography.caption, color: c.danger, marginBottom: spacing.sm },
      rowError: { borderWidth: 1, borderColor: c.danger },
    })
  );

  const rawErr =
    errorMessage ?? (errors?.[name] ? String(errors[name]?.message ?? "") : "");
  const inlineErr = rawErr ? translateFormMessage(t, rawErr) : "";

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { value, onChange } }) => (
          <>
            <Pressable
              onPress={() => setOpen(true)}
              style={[styles.row, inlineErr ? styles.rowError : null]}
            >
              <Text style={styles.value}>
                {typeof value === "number" && value > 0
                  ? formatEntryDate(value)
                  : t("composer.dateNotSet")}
              </Text>
              <LocaleUiText style={styles.link}>{t("diary.reminder.pickDate")}</LocaleUiText>
            </Pressable>
            {open ? (
              <DateTimePicker
                mode="date"
                value={
                  typeof value === "number" && value > 0 ? new Date(value) : new Date()
                }
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(event, selected) => {
                  setOpen(false);
                  if (event.type === "dismissed" || !selected) return;
                  const d = new Date(selected);
                  d.setHours(12, 0, 0, 0);
                  onChange(d.getTime());
                }}
              />
            ) : null}
          </>
        )}
      />
      {inlineErr ? <Text style={styles.err}>{inlineErr}</Text> : null}
    </View>
  );
}
