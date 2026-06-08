import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { luxuryCardBorder } from "@/theme/luxuryTokens";
import { radius, spacing, typography, useTheme, useThemedStyles, useThemeColors } from "@/theme";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label?: string;
  required?: boolean;
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  /** Sheet heading; defaults to `label`. */
  title?: string;
}

/**
 * Compact, keyboard-safe dropdown. Opens a centered modal list instead of an
 * inline overlay, so it never overlaps siblings or hides behind the keyboard.
 */
export function SelectField({
  label,
  required = false,
  value,
  options,
  placeholder,
  onChange,
  containerStyle,
  title,
}: SelectFieldProps) {
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: { gap: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted, fontWeight: "700" },
      requiredMark: { color: c.danger },
      field: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        paddingHorizontal: spacing.md + 2,
        minHeight: 54,
      },
      valueText: { ...typography.body, color: c.text, flex: 1 },
      placeholderText: { ...typography.body, color: c.textSubtle, flex: 1 },
      backdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "center",
        padding: spacing.lg,
      },
      sheet: {
        backgroundColor: c.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        maxHeight: "70%",
        overflow: "hidden",
      },
      sheetHeader: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      sheetTitle: { ...typography.titleSm, color: c.text },
      option: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      optionActive: { backgroundColor: c.primaryLight },
      optionLabel: { ...typography.body, color: c.text },
      optionLabelActive: { color: c.primaryDark, fontWeight: "700" },
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
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected ? selected.label : placeholder ?? ""}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={22} color={colors.textSubtle} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{title ?? label}</Text>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {opt.label}
                      </Text>
                      {active ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={20}
                          color={colors.primary}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
