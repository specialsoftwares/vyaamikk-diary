import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";

export function GrinFieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: { gap: spacing.xs, marginBottom: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted },
      value: { ...typography.body, color: c.text },
    })
  );
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}
