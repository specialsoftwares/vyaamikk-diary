import React, { useMemo, useState } from "react";

import { formatEntryDate } from "@/utils/date";
import { spacing } from "@/theme/spacing";

import { useGrinT, useGrinThemedStyles } from "./grinScreenHooks";
import { Button, Platform, StyleSheet, Text, View } from "./grinSurfaces";

type DateTimePickerComponent = React.ComponentType<{
  value: Date;
  mode: "date" | "time" | "datetime";
  display?: string;
  onChange: (event: unknown, date?: Date) => void;
}>;

function loadDateTimePicker(): DateTimePickerComponent | null {
  if (Platform.OS === "web") return null;
  try {
    // Lazy: Node GRIN mount suites must not resolve this at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-community/datetimepicker") as {
      default?: DateTimePickerComponent;
    };
    return mod.default ?? (mod as unknown as DateTimePickerComponent);
  } catch {
    return null;
  }
}

/**
 * Displays a readable local date/time while keeping the stored value as ISO-8601.
 * Timezone string remains a separate parent field (validation / FY numbering).
 *
 * Avoid `@/theme` barrel / typography imports here — they pull `react-native`
 * and break Node mount suites (esbuild TransformError on RN index).
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
  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      label: { fontSize: 12, fontWeight: "700", color: c.textMuted, marginBottom: spacing.xs },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surface,
        marginBottom: spacing.sm,
      },
      value: { fontSize: 15, color: c.text, flex: 1 },
      hint: { fontSize: 12, color: c.textMuted, marginBottom: spacing.sm },
      actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
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
  const Picker = phase === "closed" ? null : loadDateTimePicker();

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityLabel={label}>
        <Text style={styles.value}>{display}</Text>
        <Button
          label={t("grin.field.changeArrival")}
          size="sm"
          fullWidth={false}
          variant="secondary"
          onPress={() => setPhase("date")}
        />
      </View>
      <Text style={styles.hint}>{t("grin.field.arrivalStoredHint")}</Text>
      {Picker && phase !== "closed" && Platform.OS === "ios" ? (
        <Picker
          value={parsed}
          mode="datetime"
          display="spinner"
          onChange={(_, date) => {
            if (!date) return;
            commit(date);
          }}
        />
      ) : null}
      {Picker && phase === "date" && Platform.OS === "android" ? (
        <Picker
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
      {Picker && phase === "time" && Platform.OS === "android" ? (
        <Picker
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
      {phase !== "closed" && (Platform.OS === "ios" || !Picker) ? (
        <View style={styles.actions}>
          <Button
            label={t("common.done")}
            size="sm"
            fullWidth={false}
            variant="secondary"
            onPress={() => setPhase("closed")}
          />
        </View>
      ) : null}
    </View>
  );
}
