import React, { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { useFormFocus } from "@/components/inputSafety/FormFocusManager";
import { spacing, typography } from "@/theme";

interface OnboardingV2TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string | null;
  required?: boolean;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "email-address";
  maxLength?: number;
  /** Registers with FormFocusProvider for return-key navigation. */
  navFieldKey?: string;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

export const OnboardingV2TextField = forwardRef<TextInput, OnboardingV2TextFieldProps>(
  function OnboardingV2TextField(
    {
      label,
      value,
      onChangeText,
      onBlur,
      placeholder,
      error,
      required,
      editable = true,
      autoCapitalize = "sentences",
      autoCorrect = false,
      keyboardType = "default",
      maxLength,
      navFieldKey,
      returnKeyType,
      blurOnSubmit,
      onSubmitEditing,
      testID,
      ...rest
    },
    ref
  ) {
    const { tokens } = useAuthV2Theme();
    const formFocus = useFormFocus();
    const [focused, setFocused] = useState(false);

    const navProps =
      navFieldKey && formFocus && editable
        ? formFocus.getNavigationProps(navFieldKey, { multiline: false, navigable: editable })
        : null;

    const registerNavRef = (node: TextInput | null) => {
      if (navFieldKey && formFocus) {
        formFocus.registerField(navFieldKey, node, { multiline: false, navigable: editable });
      }
    };

    return (
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: tokens.muted }]}>
          {label}
          {required ? <Text style={{ color: tokens.danger }}> *</Text> : null}
        </Text>
        <TextInput
          ref={mergeRefs(ref, registerNavRef)}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={tokens.placeholder}
          editable={editable}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType={returnKeyType ?? navProps?.returnKeyType}
          blurOnSubmit={blurOnSubmit ?? navProps?.blurOnSubmit ?? false}
          onSubmitEditing={onSubmitEditing ?? navProps?.onSubmitEditing}
          style={[
            styles.input,
            {
              backgroundColor: tokens.inputBg,
              borderColor: error ? tokens.danger : focused ? tokens.primary : tokens.inputBorder,
              color: tokens.inputText,
              opacity: editable ? 1 : 0.72,
            },
          ]}
          {...rest}
        />
        {error ? (
          <Text style={[styles.error, { color: tokens.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.md },
  label: { ...typography.captionStrong },
  input: {
    ...typography.body,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  error: { ...typography.caption, marginTop: spacing.xs },
});
