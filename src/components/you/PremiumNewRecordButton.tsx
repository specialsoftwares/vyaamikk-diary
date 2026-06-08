import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";

import { PremiumActionButton } from "@/components/ui/PremiumActionButton";

interface PremiumNewRecordButtonProps {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** You tab footer CTA — pill primary premium, fixed footprint. */
export function PremiumNewRecordButton({
  label,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: PremiumNewRecordButtonProps) {
  return (
    <PremiumActionButton
      label={label}
      onPress={onPress}
      variant="primary"
      shape="pill"
      size="lg"
      accessibilityLabel={accessibilityLabel}
      style={style}
      testID={testID}
    />
  );
}
