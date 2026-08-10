import React, { useState } from "react";
import {
  BackHandler,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import {
  BUSINESS_PRACTICE_TYPES,
  practiceTypeLabelFromValue,
  type BusinessConstitution,
} from "@/onboarding/businessConstitution";
import { spacing, typography } from "@/theme";

interface BusinessConstitutionFieldProps {
  value: string;
  onChange: (value: BusinessConstitution) => void;
  disabled?: boolean;
  error?: string | null;
}

export function BusinessConstitutionField({
  value,
  onChange,
  disabled = false,
  error = null,
}: BusinessConstitutionFieldProps) {
  const { tokens } = useAuthV2Theme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const openSelector = () => {
    if (disabled) return;
    Keyboard.dismiss();
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  return (
    <View>
      <Text style={[styles.label, { color: tokens.muted }]}>
        Business / practice type
        <Text style={{ color: tokens.danger }}> *</Text>
      </Text>
      <Pressable
        onPress={openSelector}
        disabled={disabled}
        testID="constitution-select-field"
        accessibilityRole="button"
        accessibilityLabel="Business / practice type"
        style={[
          styles.field,
          {
            backgroundColor: tokens.inputBg,
            borderColor: error ? tokens.danger : tokens.inputBorder,
          },
        ]}
      >
        <Text
          style={[
            styles.fieldText,
            { color: value.trim() ? tokens.inputText : tokens.placeholder },
          ]}
          numberOfLines={2}
        >
          {value.trim() ? practiceTypeLabelFromValue(value) : "Select type"}
        </Text>
      </Pressable>
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Dismiss" />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: "#171B3D",
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <Text style={styles.sheetTitle}>Business / practice type</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {BUSINESS_PRACTICE_TYPES.map((item) => {
                const selected =
                  value === item.label || value === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      onChange(item.label);
                      close();
                    }}
                    testID={`constitution-option-${item.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.option,
                      selected && { backgroundColor: "rgba(165,180,252,0.18)" },
                    ]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextOn]}>
                      {item.label}
                    </Text>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.captionStrong, marginBottom: 6 },
  field: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  fieldText: { ...typography.body, fontSize: 16 },
  error: { ...typography.caption, marginTop: 6 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,8,16,0.62)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "72%",
    paddingTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  sheetTitle: {
    ...typography.titleSm,
    color: "#FFFFFF",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { maxHeight: 420 },
  listContent: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  option: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  optionText: {
    ...typography.body,
    color: "rgba(255,255,255,0.88)",
    flex: 1,
    flexShrink: 1,
    paddingRight: spacing.sm,
  },
  optionTextOn: { color: "#E0E7FF", fontWeight: "700" },
  check: { color: "#A5B4FC", fontSize: 18, fontWeight: "700", width: 22, textAlign: "center" },
});
