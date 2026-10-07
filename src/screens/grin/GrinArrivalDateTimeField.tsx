import React, { useMemo, useState } from "react";

import { formatEntryDate } from "@/utils/date";
import { spacing } from "@/theme/spacing";

import { useGrinT, useGrinThemedStyles } from "./grinScreenHooks";
import { Banner, Button, Platform, StyleSheet, Text, View } from "./grinSurfaces";

export type ArrivalPickerEvent = { type?: string };

export type ArrivalDateTimePickerProps = {
  value: Date;
  mode: "date" | "time" | "datetime";
  display?: string;
  onChange: (event: ArrivalPickerEvent, date?: Date) => void;
};

export type ArrivalDateTimePickerComponent = React.ComponentType<ArrivalDateTimePickerProps>;

/** datetimepicker 8.4.4: dismissed events still pass originalValue — only "set" commits. */
export function isArrivalPickerSelection(event: ArrivalPickerEvent | null | undefined): boolean {
  return event?.type === "set";
}

function loadDefaultDateTimePicker(): ArrivalDateTimePickerComponent | null {
  if (Platform.OS === "web") return null;
  try {
    // Lazy: Node GRIN mount suites must not resolve this at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-community/datetimepicker") as {
      default?: ArrivalDateTimePickerComponent;
    };
    return mod.default ?? (mod as unknown as ArrivalDateTimePickerComponent);
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
  DateTimePicker: InjectedPicker,
}: {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
  /** Injected for regression tests only — not native acceptance. */
  DateTimePicker?: ArrivalDateTimePickerComponent | null;
}): React.ReactElement {
  const t = useGrinT();
  const [phase, setPhase] = useState<"closed" | "date" | "time" | "ios">("closed");
  /** Draft while a multi-step edit is open; committed only on confirmed selection. */
  const [draft, setDraft] = useState<Date | null>(null);
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

  const committed = useMemo(() => {
    const d = new Date(valueIso);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }, [valueIso]);

  const shown = draft ?? committed;

  const display = useMemo(() => {
    try {
      return `${formatEntryDate(shown.getTime())} · ${shown.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return valueIso;
    }
  }, [shown, valueIso]);

  const pickerAvailable =
    InjectedPicker !== undefined ? InjectedPicker != null : loadDefaultDateTimePicker() != null;
  const Picker: ArrivalDateTimePickerComponent | null =
    phase === "closed"
      ? null
      : InjectedPicker !== undefined
        ? InjectedPicker
        : loadDefaultDateTimePicker();

  const closeWithoutCommit = () => {
    setDraft(null);
    setPhase("closed");
  };

  const openEdit = () => {
    if (!pickerAvailable) return;
    setDraft(new Date(committed.getTime()));
    setPhase(Platform.OS === "ios" ? "ios" : "date");
  };

  const commitDraft = (next: Date) => {
    onChangeIso(next.toISOString());
    setDraft(null);
    setPhase("closed");
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityLabel={label}>
        <Text style={styles.value}>{display}</Text>
        {pickerAvailable ? (
          <Button
            label={t("grin.field.changeArrival")}
            size="sm"
            fullWidth={false}
            variant="secondary"
            onPress={openEdit}
          />
        ) : null}
      </View>
      <Text style={styles.hint}>{t("grin.field.arrivalStoredHint")}</Text>
      {!pickerAvailable ? (
        <Banner tone="info" message={t("grin.field.arrivalPickerUnavailable")} />
      ) : null}

      {Picker && phase === "ios" ? (
        <>
          <Picker
            value={shown}
            mode="datetime"
            display="spinner"
            onChange={(event, date) => {
              if (!isArrivalPickerSelection(event) || !date) {
                if (event?.type === "dismissed") closeWithoutCommit();
                return;
              }
              setDraft(date);
            }}
          />
          <View style={styles.actions}>
            <Button
              label={t("common.cancel")}
              size="sm"
              fullWidth={false}
              variant="secondary"
              onPress={closeWithoutCommit}
            />
            <Button
              label={t("common.done")}
              size="sm"
              fullWidth={false}
              variant="secondary"
              onPress={() => {
                if (draft) commitDraft(draft);
                else closeWithoutCommit();
              }}
            />
          </View>
        </>
      ) : null}

      {Picker && phase === "date" ? (
        <Picker
          value={shown}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (!isArrivalPickerSelection(event) || !date) {
              closeWithoutCommit();
              return;
            }
            const next = new Date(shown);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            setDraft(next);
            setPhase("time");
          }}
        />
      ) : null}

      {Picker && phase === "time" ? (
        <Picker
          value={shown}
          mode="time"
          display="default"
          onChange={(event, date) => {
            if (!isArrivalPickerSelection(event) || !date) {
              closeWithoutCommit();
              return;
            }
            const next = new Date(shown);
            // Preserve seconds/ms from the in-progress draft (or committed baseline).
            next.setHours(date.getHours(), date.getMinutes(), shown.getSeconds(), shown.getMilliseconds());
            commitDraft(next);
          }}
        />
      ) : null}
    </View>
  );
}
