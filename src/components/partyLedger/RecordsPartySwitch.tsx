import React from "react";
import { StyleSheet, View } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

export type RecordsPane = "records" | "partyLedger";

interface RecordsPartySwitchProps {
  pane: RecordsPane;
  onChange: (pane: RecordsPane) => void;
  recordsLabel: string;
  ledgerLabel: string;
  accessibilityLabel: string;
}

export function RecordsPartySwitch({
  pane,
  onChange,
  recordsLabel,
  ledgerLabel,
  accessibilityLabel,
}: RecordsPartySwitchProps) {
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignSelf: "flex-start",
        padding: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceMuted,
        gap: 2,
      },
      segment: {
        minHeight: 32,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
      },
      selected: { backgroundColor: colors.primary },
      label: { ...typography.captionStrong, color: colors.textMuted },
      labelSelected: { color: colors.textOnPrimary },
    })
  );

  const segment = (id: RecordsPane, label: string) => {
    const selected = pane === id;
    return (
      <LuxuryPressable
        key={id}
        style={[styles.segment, selected ? styles.selected : null]}
        onPress={() => onChange(id)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <LocaleUiText style={[styles.label, selected ? styles.labelSelected : null]}>{label}</LocaleUiText>
      </LuxuryPressable>
    );
  };

  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {segment("records", recordsLabel)}
      {segment("partyLedger", ledgerLabel)}
    </View>
  );
}
