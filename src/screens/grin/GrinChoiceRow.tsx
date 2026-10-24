import React from "react";

import { spacing } from "@/theme/spacing";

import { IndigoChoiceChip, IndigoChoiceChipRow, Text, View, StyleSheet } from "./grinSurfaces";
import { useGrinThemedStyles } from "./grinScreenHooks";

export function GrinChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): React.ReactElement {
  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.sm },
      label: { fontSize: 12, fontWeight: "700", color: c.textMuted },
    })
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <IndigoChoiceChipRow>
        {options.map((option) => (
          <IndigoChoiceChip
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </IndigoChoiceChipRow>
    </View>
  );
}
