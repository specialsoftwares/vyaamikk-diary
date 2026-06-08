import React, { useCallback, useMemo, useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SimpleDatePickRow } from "@/components/dashboard/SimpleDatePickRow";
import {
  getAtAGlanceBounds,
  normalizeAtAGlanceCustomRange,
  validateAtAGlanceCustomRange,
  type AtAGlanceCustomRange,
} from "@/services/dashboard";
import { useI18n, useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { startOfDay, subDays } from "date-fns";

export interface AtAGlanceWeekRangeControlProps {
  /** Applied custom range; null = default rolling week. */
  appliedRange: AtAGlanceCustomRange | null;
  onApply: (range: AtAGlanceCustomRange) => void;
  onResetDefault: () => void;
}

export function AtAGlanceWeekRangeControl({
  appliedRange,
  onApply,
  onResetDefault,
}: AtAGlanceWeekRangeControlProps) {
  const t = useT();
  const { lang } = useI18n();
  const bounds = useMemo(() => getAtAGlanceBounds(), []);
  const [expanded, setExpanded] = useState(false);
  const [fromMs, setFromMs] = useState(bounds.weekStart);
  const [toMs, setToMs] = useState(bounds.todayStart);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const maxDate = useMemo(() => new Date(bounds.todayStart), [bounds.todayStart]);
  const minDate = useMemo(() => subDays(maxDate, 730), [maxDate]);

  const openCustom = useCallback(() => {
    if (appliedRange) {
      setFromMs(appliedRange.startMs);
      setToMs(appliedRange.endMs);
    } else {
      setFromMs(bounds.weekStart);
      setToMs(bounds.todayStart);
    }
    setErrorKey(null);
    setExpanded(true);
  }, [appliedRange, bounds]);

  const apply = useCallback(() => {
    const code = validateAtAGlanceCustomRange(fromMs, toMs);
    if (code) {
      setErrorKey(`atAGlance.customRange.${code}`);
      return;
    }
    const range = normalizeAtAGlanceCustomRange(fromMs, toMs);
    setErrorKey(null);
    setExpanded(false);
    onApply(range);
  }, [fromMs, toMs, onApply]);

  const presetLastWeek = useCallback(() => {
    const end = startOfDay(subDays(new Date(bounds.todayStart), 7)).getTime();
    const start = startOfDay(subDays(new Date(end), 6)).getTime();
    setFromMs(start);
    setToMs(end);
    setErrorKey(null);
  }, [bounds.todayStart]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginBottom: spacing.md },
      row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      chipText: { ...typography.captionStrong, color: c.text },
      chipTextOn: { color: c.primaryDark },
      panel: {
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
      action: { ...typography.captionStrong, color: c.primary },
      actionMuted: { ...typography.captionStrong, color: c.textMuted },
      err: { ...typography.caption, color: c.danger, marginTop: spacing.xs },
      hint: { ...typography.caption, color: c.textSubtle, marginBottom: spacing.sm },
    })
  );

  const isCustomActive = appliedRange != null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={onResetDefault}
          style={[styles.chip, !isCustomActive ? styles.chipOn : null]}
          accessibilityRole="button"
        >
          <LocaleUiText style={[styles.chipText, !isCustomActive ? styles.chipTextOn : null]}>
            {t("atAGlance.customRange.defaultWeek")}
          </LocaleUiText>
        </Pressable>
        <Pressable
          onPress={expanded ? () => setExpanded(false) : openCustom}
          style={[styles.chip, isCustomActive ? styles.chipOn : null]}
          accessibilityRole="button"
        >
          <LocaleUiText style={[styles.chipText, isCustomActive ? styles.chipTextOn : null]}>
            {t("atAGlance.customRange.custom")}
          </LocaleUiText>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.panel}>
          <LocaleUiText style={styles.hint}>{t("atAGlance.customRange.hint")}</LocaleUiText>
          <SimpleDatePickRow
            label={t("atAGlance.customRange.from")}
            valueMs={fromMs}
            onChange={setFromMs}
            minimumDate={minDate}
            maximumDate={maxDate}
          />
          <SimpleDatePickRow
            label={t("atAGlance.customRange.to")}
            valueMs={toMs}
            onChange={setToMs}
            minimumDate={minDate}
            maximumDate={maxDate}
          />
          {errorKey ? <LocaleUiText style={styles.err}>{t(errorKey)}</LocaleUiText> : null}
          <View style={styles.actions}>
            <Pressable onPress={apply} accessibilityRole="button">
              <LocaleUiText style={styles.action}>{t("atAGlance.customRange.apply")}</LocaleUiText>
            </Pressable>
            <Pressable onPress={presetLastWeek} accessibilityRole="button">
              <LocaleUiText style={styles.actionMuted}>{t("atAGlance.customRange.presetLastWeek")}</LocaleUiText>
            </Pressable>
            <Pressable onPress={() => setExpanded(false)} accessibilityRole="button">
              <LocaleUiText style={styles.actionMuted}>{t("common.cancel")}</LocaleUiText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
