import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatLocationCardLines } from "@/auth-v2/locationCardModel";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

interface LocationConfirmationCardProps {
  locality: string | null;
  district: string;
  state: string;
  confirmed: boolean;
}

export function LocationConfirmationCard({
  locality,
  district,
  state,
  confirmed,
}: LocationConfirmationCardProps) {
  const { tokens } = useAuthV2Theme();
  const { title, subtitle } = formatLocationCardLines({ locality, district, state });
  return (
    <View
      style={[styles.card, { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder }]}
      accessibilityRole="summary"
      testID="location-confirmation-card"
    >
      <Text style={[styles.title, { color: tokens.heading }]}>{title}</Text>
      {subtitle && subtitle !== title ? (
        <Text style={[styles.sub, { color: tokens.body }]}>{subtitle}</Text>
      ) : null}
      {confirmed ? (
        <Text style={[styles.ok, { color: tokens.secondaryActiveFg }]}>✓ Confirmed</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: spacing.md,
    gap: 4,
  },
  title: { ...typography.bodyStrong, fontSize: 18 },
  sub: { ...typography.caption, lineHeight: 18 },
  ok: { ...typography.captionStrong, marginTop: spacing.xs },
});
