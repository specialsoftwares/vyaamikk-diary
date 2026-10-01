import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { IndigoChoiceChip, IndigoChoiceChipRow } from "@/components/ui";
import { spacing, typography, useThemedStyles } from "@/theme";

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
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted, fontWeight: "700" },
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
