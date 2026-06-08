import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatFinancialYearLabel, getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";

interface FySelectorProps {
  selectedFy: number;
  availableFys: number[];
  onSelect: (fy: number) => void;
}

export function FySelector({ selectedFy, availableFys, onSelect }: FySelectorProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
      chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      chipText: { ...typography.captionStrong, color: c.textMuted },
      chipTextOn: { color: c.primaryDark },
    })
  );

  const fys = availableFys.length ? availableFys : [getCurrentFinancialYear()];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {fys.map((fy) => {
        const on = fy === selectedFy;
        return (
          <Pressable key={fy} onPress={() => onSelect(fy)}>
            <View style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {formatFinancialYearLabel(fy)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
