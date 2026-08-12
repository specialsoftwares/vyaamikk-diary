import React, { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { otpCellsFromValue } from "@/auth-v2/otp/onboardingOtpModel";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

interface OnboardingOtpCellsProps {
  value: string;
  length: number;
  onChange: (digits: string) => void;
  disabled?: boolean;
  error?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
}

export function OnboardingOtpCells({
  value,
  length,
  onChange,
  disabled = false,
  error = false,
  testID = "onboarding-otp-cells",
  accessibilityLabel = "Verification code",
  autoComplete = "one-time-code",
  textContentType = "oneTimeCode",
}: OnboardingOtpCellsProps) {
  const { tokens } = useAuthV2Theme();
  const inputRef = useRef<TextInput>(null);
  const cells = otpCellsFromValue(value, length);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={styles.wrap}
    >
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {cells.map((digit, index) => {
          const focused = !disabled && index === activeIndex;
          return (
            <View
              key={index}
              style={[
                styles.cell,
                {
                  backgroundColor: tokens.inputBg,
                  borderColor: error
                    ? tokens.danger
                    : focused
                      ? tokens.secondaryActiveFg
                      : tokens.inputBorder,
                },
              ]}
            >
              <Text style={[styles.digit, { color: tokens.inputText }]}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={length}
        editable={!disabled}
        caretHidden
        autoComplete={autoComplete}
        textContentType={textContentType}
        importantForAutofill="yes"
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus
        style={styles.hiddenInput}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: {
    ...typography.titleMd,
    fontVariant: ["tabular-nums"],
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
    fontSize: 16,
  },
});
