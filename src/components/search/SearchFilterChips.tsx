import React, { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import type { GlobalSearchFilter } from "@/services/search";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const FILTERS: GlobalSearchFilter[] = [
  "all",
  "records",
  "payments",
  "freight",
  "materials",
  "staff",
  "reminders",
  "letterhead",
  "pdfs",
];

interface SearchFilterChipsProps {
  value: GlobalSearchFilter;
  onChange: (f: GlobalSearchFilter) => void;
  label: (f: GlobalSearchFilter) => string;
}

export const SearchFilterChips = memo(function SearchFilterChips({
  value,
  onChange,
  label,
}: SearchFilterChipsProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      scroll: { marginBottom: spacing.sm },
      row: { flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
      chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      chipActive: {
        backgroundColor: c.primaryLight,
        borderColor: c.primary,
      },
      chipText: { ...typography.captionStrong, color: c.textMuted },
      chipTextActive: { color: c.primaryDark },
    })
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label(f)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});
