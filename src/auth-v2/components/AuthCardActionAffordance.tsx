import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  ACTION_PRESS_OPACITY,
  resolveCardActionAccessibility,
} from "@/actionSystem";
import { AuthSecondaryActiveChip } from "@/auth-v2/components/AuthSecondaryActiveChip";
import { spacing } from "@/theme";

export interface AuthCardActionAffordanceProps {
  actionLabel: string;
  accessibilityLabel?: string;
  onAction: () => void;
  editable?: boolean;
  /** Left column (title or field stack). */
  leading: React.ReactNode;
  /** Optional body below the header row. */
  children?: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  testID?: string;
  chipTestID?: string;
  purpose?: "modify" | "security";
}

/**
 * Review / contacts card with visible Edit|Change chip and whole-card activation.
 * Single TalkBack focus target when editable (chip a11y-hidden).
 */
export function AuthCardActionAffordance({
  actionLabel,
  accessibilityLabel,
  onAction,
  editable = true,
  leading,
  children,
  cardStyle,
  testID,
  chipTestID,
  purpose = "modify",
}: AuthCardActionAffordanceProps) {
  const a11y = resolveCardActionAccessibility({
    actionLabel: accessibilityLabel ?? actionLabel,
    onAction,
    wholeCardActivates: editable,
    disabled: !editable,
  });

  const content = (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.leading}>{leading}</View>
        {editable ? (
          <AuthSecondaryActiveChip
            label={actionLabel}
            onPress={onAction}
            accessibilityLabel={accessibilityLabel ?? actionLabel}
            accessibilityElementsHidden={a11y.chip.accessibilityElementsHidden}
            purpose={purpose === "security" ? "security" : "modify"}
            testID={chipTestID}
            minWidth={purpose === "security" ? 88 : 72}
          />
        ) : null}
      </View>
      {children}
    </>
  );

  if (!editable) {
    return (
      <View style={cardStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={a11y.card.onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y.card.accessibilityLabel}
      accessibilityState={a11y.card.accessibilityState}
      testID={testID}
      style={({ pressed }) => [
        cardStyle,
        pressed ? { opacity: ACTION_PRESS_OPACITY } : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  leading: { flex: 1 },
});
