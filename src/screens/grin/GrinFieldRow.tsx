import React from "react";

import { spacing } from "@/theme/spacing";

import { Text, View, StyleSheet } from "./grinSurfaces";
import { useGrinThemedStyles } from "./grinScreenHooks";

export function GrinFieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      row: { gap: spacing.xs, marginBottom: spacing.sm },
      label: { fontSize: 12, fontWeight: "700", color: c.textMuted },
      value: { fontSize: 16, color: c.text },
    })
  );
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}
