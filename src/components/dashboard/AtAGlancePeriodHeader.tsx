import React, { useMemo } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { AtAGlanceViewKind } from "@/services/dashboard";
import {
  getAtAGlancePeriodDisplay,
  getAtAGlancePeriodDisplayForRange,
  type AtAGlanceCustomRange,
} from "@/services/dashboard";
import { useT } from "@/i18n";
import { spacing, typography, useCategoryAccent, useThemedStyles } from "@/theme";

interface AtAGlancePeriodHeaderProps {
  view: AtAGlanceViewKind;
  /** When set on This week, pill reflects the custom filter. */
  customWeekRange?: AtAGlanceCustomRange | null;
}

/** Date-range pill + context line under the screen title (bounds match filter logic). */
export function AtAGlancePeriodHeader({
  view,
  customWeekRange = null,
}: AtAGlancePeriodHeaderProps) {
  const t = useT();
  const accent = useCategoryAccent("work");
  const displayLang = "en" as const;

  const period = useMemo(() => {
    if (view === "this_week" && customWeekRange) {
      return getAtAGlancePeriodDisplayForRange(customWeekRange, displayLang);
    }
    return getAtAGlancePeriodDisplay(view, displayLang);
  }, [view, customWeekRange, displayLang]);

  const contextLine = useMemo(() => {
    if (view === "upcoming") {
      return t("atAGlance.upcoming.periodHint");
    }
    if (view === "this_week") {
      return t("atAGlance.period.recordsFrom", {
        startDate: period.startDate,
        endDate: period.endDate,
      });
    }
    if (view === "today") {
      return t("atAGlance.period.todayOn", { date: period.startDate });
    }
    return null;
  }, [view, period, t]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginTop: spacing.xs, marginBottom: spacing.md },
      pillRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        alignSelf: "flex-start",
        paddingVertical: 6,
        paddingHorizontal: spacing.sm + 2,
        borderRadius: 999,
        backgroundColor: accent.soft,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: accent.main + "28",
      },
      iconRing: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.surface,
      },
      pillText: { ...typography.captionStrong, color: c.text },
      customBadge: {
        ...typography.caption,
        color: accent.main,
        marginLeft: spacing.xs,
      },
      context: {
        ...typography.caption,
        color: c.textSubtle,
        marginTop: spacing.sm,
        lineHeight: 18,
      },
    })
  );

  if (view === "upcoming" && !contextLine) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {period.showRangePill && period.rangeCompact ? (
        <View style={styles.pillRow} accessibilityLabel={period.rangeCompact}>
          <View style={styles.iconRing}>
            <MaterialCommunityIcons name="calendar-range" size={14} color={accent.main} />
          </View>
          <Text style={styles.pillText}>{period.rangeCompact}</Text>
          {view === "this_week" && customWeekRange ? (
            <LocaleUiText style={styles.customBadge}>{t("atAGlance.customRange.badge")}</LocaleUiText>
          ) : null}
        </View>
      ) : null}
      {contextLine ? <Text style={styles.context}>{contextLine}</Text> : null}
    </View>
  );
}
