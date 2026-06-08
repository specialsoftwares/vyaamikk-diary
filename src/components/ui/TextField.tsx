import React, { forwardRef, useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { luxuryCardBorder } from "@/theme/luxuryTokens";
import { radius, spacing, typography, useTheme, useThemedStyles, useThemeColors } from "@/theme";
import { formInputFocusedStyle } from "@/theme/formLayer";
import { useFormFocus } from "@/components/inputSafety/FormFocusManager";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  /** When true, appends * to the label. */
  required?: boolean;
  hint?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  multiline?: boolean;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
  /** Registers with FormFocusProvider for return-key next-field navigation. */
  navFieldKey?: string;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(value);
      } else {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    }
  };
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    required = false,
    hint,
    error,
    containerStyle,
    multiline = false,
    leftAdornment,
    rightAdornment,
    editable,
    navFieldKey,
    blurOnSubmit: blurOnSubmitProp,
    returnKeyType: returnKeyTypeProp,
    onSubmitEditing: onSubmitEditingProp,
    ...inputProps
  },
  ref
) {
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const formFocus = useFormFocus();
  const [focused, setFocused] = useState(false);
  const innerRef = useRef<TextInput | null>(null);
  const isEditable = editable !== false;

  const navProps =
    navFieldKey && formFocus && isEditable
      ? formFocus.getNavigationProps(navFieldKey, { multiline })
      : null;

  const registerNavRef = useCallback(
    (node: TextInput | null) => {
      if (navFieldKey && formFocus) {
        formFocus.registerField(navFieldKey, node, { multiline, navigable: isEditable });
      }
    },
    [formFocus, isEditable, multiline, navFieldKey]
  );

  const focusInput = useCallback(() => {
    if (!isEditable) return;
    innerRef.current?.focus();
  }, [isEditable]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: { gap: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted, fontWeight: "700" },
      requiredMark: { color: c.danger },
      fieldRow: {
        flexDirection: "row",
        alignItems: "stretch",
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        paddingHorizontal: spacing.md + 2,
        minHeight: 54,
      },
      fieldRowFocused: formInputFocusedStyle(c),
      fieldRowMultiline: {
        paddingVertical: spacing.md,
        minHeight: 110,
      },
      fieldRowError: { borderColor: c.danger, backgroundColor: c.dangerSoft },
      adornment: { marginRight: spacing.sm, alignSelf: "center" },
      adornmentMultiline: { marginRight: spacing.sm, alignSelf: "flex-start", marginTop: 2 },
      input: {
        flex: 1,
        alignSelf: "stretch",
        ...typography.body,
        color: c.text,
        paddingVertical: 12,
        minWidth: 0,
        minHeight: 28,
      },
      inputMultiline: {
        textAlignVertical: "top",
        paddingTop: 0,
        minHeight: 78,
      },
      error: { ...typography.caption, color: c.danger },
      hint: { ...typography.caption, color: c.textSubtle },
    })
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        onPress={focusInput}
        disabled={!isEditable}
        style={[
          styles.fieldRow,
          multiline && styles.fieldRowMultiline,
          !error && focused && styles.fieldRowFocused,
          error ? styles.fieldRowError : null,
        ]}
      >
        {leftAdornment ? (
          <View style={multiline ? styles.adornmentMultiline : styles.adornment}>{leftAdornment}</View>
        ) : null}
        <TextInput
          ref={mergeRefs(ref, innerRef, registerNavRef)}
          {...inputProps}
          editable={editable}
          multiline={multiline}
          blurOnSubmit={
            blurOnSubmitProp !== undefined
              ? blurOnSubmitProp
              : navProps?.blurOnSubmit ?? (multiline ? false : undefined)
          }
          returnKeyType={returnKeyTypeProp ?? navProps?.returnKeyType}
          onSubmitEditing={onSubmitEditingProp ?? navProps?.onSubmitEditing}
          placeholderTextColor={colors.textSubtle}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            !isEditable && { color: colors.textMuted },
          ]}
        />
        {rightAdornment ? (
          <View style={multiline ? styles.adornmentMultiline : styles.adornment}>{rightAdornment}</View>
        ) : null}
      </Pressable>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});
