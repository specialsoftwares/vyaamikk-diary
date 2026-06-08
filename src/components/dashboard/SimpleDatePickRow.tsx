import React, { useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { useT } from "@/i18n";

interface SimpleDatePickRowProps {
  label: string;
  valueMs: number;
  onChange: (ms: number) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function SimpleDatePickRow({
  label,
  valueMs,
  onChange,
  minimumDate,
  maximumDate,
}: SimpleDatePickRowProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      label: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.xs },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: c.surfaceMuted,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.sm,
      },
      value: { ...typography.body, color: c.text },
      link: { ...typography.captionStrong, color: c.primary },
    })
  );

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.row} accessibilityRole="button">
        <Text style={styles.value}>
          {valueMs > 0 ? formatEntryDate(valueMs) : t("composer.dateNotSet")}
        </Text>
        <LocaleUiText style={styles.link}>{t("diary.reminder.pickDate")}</LocaleUiText>
      </Pressable>
      {open ? (
        <DateTimePicker
          mode="date"
          value={valueMs > 0 ? new Date(valueMs) : new Date()}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, selected) => {
            setOpen(false);
            if (!selected) return;
            const d = new Date(selected);
            d.setHours(12, 0, 0, 0);
            onChange(d.getTime());
          }}
        />
      ) : null}
    </View>
  );
}
