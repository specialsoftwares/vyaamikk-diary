import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { TextField, type TextFieldProps } from "@/components/ui/TextField";
import {
  parseEmailForDomainSuggest,
  suggestEmailDomains,
} from "@/utils/email/emailDomainSuggestions";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { premiumElevation } from "@/components/ui/premiumTokens";

export interface EmailDomainSuggestionFieldProps extends TextFieldProps {
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Email field that suggests common domains as soon as the user types `@`.
 * Suggestions render in layout flow (not overlay) so fields below stay clear.
 */
export function EmailDomainSuggestionField({
  containerStyle,
  value,
  onFocus,
  onBlur,
  onChangeText,
  hint,
  ...rest
}: EmailDomainSuggestionFieldProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const [focused, setFocused] = useState(false);

  const query = value == null ? "" : String(value);
  const context = useMemo(() => parseEmailForDomainSuggest(query), [query]);
  const suggestions = useMemo(
    () => (context ? suggestEmailDomains(context.local, context.domainQuery) : []),
    [context]
  );

  const showSuggestions = focused && suggestions.length > 0;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: { gap: spacing.xs },
      panel: {
        marginTop: spacing.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceElevated,
        overflow: "hidden",
        ...premiumElevation(isDark, c, "soft"),
      },
      row: {
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      rowLast: { borderBottomWidth: 0 },
      rowValue: { ...typography.body, color: c.text },
    })
  );

  const handleFocus = useCallback(
    (e: Parameters<NonNullable<TextFieldProps["onFocus"]>>[0]) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e: Parameters<NonNullable<TextFieldProps["onBlur"]>>[0]) => {
      setTimeout(() => setFocused(false), 180);
      onBlur?.(e);
    },
    [onBlur]
  );

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText?.(text);
      setFocused(true);
    },
    [onChangeText]
  );

  const selectSuggestion = useCallback(
    (email: string) => {
      onChangeText?.(email);
      setFocused(false);
    },
    [onChangeText]
  );

  return (
    <View style={[styles.root, containerStyle]}>
      <TextField
        {...rest}
        hint={showSuggestions ? undefined : hint}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoComplete="email"
        textContentType="emailAddress"
      />
      {showSuggestions ? (
        <View style={styles.panel}>
          {suggestions.map((email, index) => (
            <Pressable
              key={email}
              onPress={() => selectSuggestion(email)}
              accessibilityRole="button"
              style={[styles.row, index === suggestions.length - 1 ? styles.rowLast : null]}
            >
              <Text style={styles.rowValue} numberOfLines={1}>
                {email}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
