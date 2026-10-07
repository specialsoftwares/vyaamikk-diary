import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { formatEntryDate } from "@/utils/date";
import { spacing, typography, useThemedStyles } from "@/theme";

import { useGrinT } from "./grinScreenHooks";

/**
 * Displays a readable local date/time while keeping the stored value as ISO-8601.
 * Timezone string remains a separate parent field (validation / FY numbering).
 */
export function GrinArrivalDateTimeField({
  label,
  valueIso,
  onChangeIso,
}: {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
}): React.ReactElement {
  const t = useGrinT();
  const [phase, setPhase] = useState<"closed" | "date" | "time">("closed");
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      label: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.xs },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surface,
        marginBottom: spacing.sm,
      },
      value: { ...typography.body, color: c.text, flex: 1 },
      link: { ...typography.captionStrong, color: c.primary },
      hint: { ...typography.caption, color: c.textMuted, marginBottom: spacing.sm },
    })
  );

  const parsed = useMemo(() => {
    const d = new Date(valueIso);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }, [valueIso]);

  const display = useMemo(() => {
    try {
      return `${formatEntryDate(parsed.getTime())} · ${parsed.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return valueIso;
    }
  }, [parsed, valueIso]);

  const commit = (next: Date) => onChangeIso(next.toISOString());

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.row}
        onPress={() => setPhase(Platform.OS === "ios" ? "date" : "date")}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.value}>{display}</Text>
        <Text style={styles.link}>{t("grin.field.changeArrival")}</Text>
      </Pressable>
      <Text style={styles.hint}>{t("grin.field.arrivalStoredHint")}</Text>
      {phase !== "closed" && Platform.OS === "ios" ? (
        <DateTimePicker
          value={parsed}
          mode="datetime"
          display="spinner"
          onChange={(_, date) => {
            if (!date) return;
            commit(date);
          }}
        />
      ) : null}
      {phase === "date" && Platform.OS !== "ios" ? (
        <DateTimePicker
          value={parsed}
          mode="date"
          display="default"
          onChange={(_, date) => {
            if (!date) {
              setPhase("closed");
              return;
            }
            const next = new Date(parsed);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            commit(next);
            setPhase("time");
          }}
        />
      ) : null}
      {phase === "time" && Platform.OS !== "ios" ? (
        <DateTimePicker
          value={parsed}
          mode="time"
          display="default"
          onChange={(_, date) => {
            setPhase("closed");
            if (!date) return;
            const next = new Date(parsed);
            next.setHours(date.getHours(), date.getMinutes(), 0, 0);
            commit(next);
          }}
        />
      ) : null}
      {phase !== "closed" && Platform.OS === "ios" ? (
        <Pressable onPress={() => setPhase("closed")} accessibilityRole="button">
          <Text style={styles.link}>{t("common.done")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
