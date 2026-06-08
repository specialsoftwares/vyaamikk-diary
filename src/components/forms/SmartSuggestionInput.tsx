import React, { forwardRef, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { TextField, type TextFieldProps } from "@/components/ui/TextField";
import { useFieldSuggestions } from "@/hooks/useFieldSuggestions";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import type { MasterDataUserScope, MasterFieldKey } from "@/services/masterData";
import { luxuryCardBorder } from "@/theme/luxuryTokens";
import { radius, spacing, typography, useTheme, useThemeColors, useThemedStyles } from "@/theme";
import { premiumElevation } from "@/components/ui/premiumTokens";

export interface SmartSuggestionInputProps extends TextFieldProps {
  fieldKey: MasterFieldKey;
  suggestionsEnabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const SmartSuggestionInput = forwardRef<
  import("react-native").TextInput,
  SmartSuggestionInputProps
>(function SmartSuggestionInput(
  {
    fieldKey,
    suggestionsEnabled = true,
    containerStyle,
    value,
    onFocus,
    onBlur,
    onChangeText,
    ...rest
  },
  ref
) {
  const t = useT();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const scope = useMemo<MasterDataUserScope | null>(
    () => (user ? { userId: user.uid, ueid: user.ueid } : null),
    [user]
  );

  const query = value == null ? "" : String(value);
  const { suggestions, open, loading, setOpen, dismiss, removeSuggestion } =
    useFieldSuggestions({
      scope,
      fieldKey,
      query,
      enabled: suggestionsEnabled && Boolean(scope),
    });

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: { position: "relative", zIndex: open ? 20 : 0 },
      dropdown: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        marginTop: 4,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        backgroundColor: c.surfaceElevated,
        overflow: "hidden",
        maxHeight: 220,
        ...premiumElevation(isDark, c, "soft"),
      },
      row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      rowLast: { borderBottomWidth: 0 },
      rowMain: { flex: 1, minWidth: 0 },
      rowValue: { ...typography.body, color: c.text },
      rowHint: { ...typography.caption, color: c.textMuted, marginTop: 2 },
      removeBtn: { padding: spacing.sm },
      loading: { padding: spacing.md, alignItems: "center" },
    })
  );

  const hintFor = useCallback(
    (row: (typeof suggestions)[number]) => {
      if (row.hintKey === "times" && row.hintCount != null && row.hintCount > 1) {
        return t("masterData.usedTimes", { count: row.hintCount });
      }
      if (row.hintKey === "source" && row.sourceType) {
        return t("masterData.fromRecord");
      }
      return t("masterData.usedRecently");
    },
    [t]
  );

  const handleFocus = useCallback(
    (e: Parameters<NonNullable<TextFieldProps["onFocus"]>>[0]) => {
      if (suggestions.length > 0 && query.trim().length >= 1) setOpen(true);
      onFocus?.(e);
    },
    [onFocus, query, setOpen, suggestions.length]
  );

  const handleBlur = useCallback(
    (e: Parameters<NonNullable<TextFieldProps["onBlur"]>>[0]) => {
      setTimeout(() => dismiss(), 150);
      onBlur?.(e);
    },
    [dismiss, onBlur]
  );

  const selectSuggestion = useCallback(
    (display: string) => {
      onChangeText?.(display);
      dismiss();
    },
    [dismiss, onChangeText]
  );

  return (
    <View style={[styles.root, containerStyle]} pointerEvents="box-none">
      <TextField
        ref={ref}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {open && suggestions.length > 0 ? (
        <View style={styles.dropdown} pointerEvents="auto">
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {suggestions.map((row, index) => (
            <View
              key={row.id}
              style={[styles.row, index === suggestions.length - 1 ? styles.rowLast : null]}
            >
              <Pressable
                style={styles.rowMain}
                onPress={() => selectSuggestion(row.display)}
                accessibilityRole="button"
              >
                <Text style={styles.rowValue} numberOfLines={1}>
                  {row.display}
                </Text>
                <Text style={styles.rowHint} numberOfLines={1}>
                  {hintFor(row)}
                </Text>
              </Pressable>
              <Pressable
                style={styles.removeBtn}
                onPress={() => void removeSuggestion(row.id)}
                accessibilityLabel={t("masterData.removeFromList")}
                hitSlop={8}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});
