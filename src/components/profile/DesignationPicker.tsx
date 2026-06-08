import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  PROFILE_DESIGNATION_IDS,
  designationValueFromSelection,
  resolveDesignationSelection,
  type ProfileDesignationId,
} from "@/domain/profileDesignation";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { TextField, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles, useThemeColors } from "@/theme";

interface DesignationPickerProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  onSubmitEditing?: () => void;
  appearance?: "default" | "authV2";
}

export function DesignationPicker({
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  onSubmitEditing,
  appearance = "default",
}: DesignationPickerProps) {
  const t = useT();
  const colors = useThemeColors();
  const { tokens: v2Tokens } = useAuthV2Theme();
  const isAuthV2 = appearance === "authV2";
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const labelForId = useCallback(
    (id: ProfileDesignationId) => t(`profile.designation.${id}`),
    [t]
  );

  const selection = useMemo(
    () => resolveDesignationSelection(value, labelForId),
    [value, labelForId]
  );

  const [pickerId, setPickerId] = useState(selection.id);
  const [custom, setCustom] = useState(selection.custom);

  React.useEffect(() => {
    setPickerId(selection.id);
    setCustom(selection.custom);
  }, [selection.id, selection.custom]);

  const hasValue = value.trim().length > 0;
  const displayLabel = !hasValue
    ? t("profile.designation.selectPlaceholder")
    : pickerId === "other"
      ? custom.trim() || t("profile.designation.selectPlaceholder")
      : labelForId(pickerId);

  const applySelection = (id: ProfileDesignationId, nextCustom: string) => {
    setPickerId(id);
    setCustom(nextCustom);
    onChange(designationValueFromSelection(id, nextCustom, labelForId));
  };

  const styles = useThemedStyles((c) => {
    const labelColor = isAuthV2 ? v2Tokens.muted : c.textMuted;
    const triggerBorder = isAuthV2 ? v2Tokens.inputBorder : c.divider;
    const triggerBg = isAuthV2 ? v2Tokens.inputBg : c.surface;
    const triggerTextColor = isAuthV2 ? v2Tokens.inputText : c.text;
    const placeholderColor = isAuthV2 ? v2Tokens.placeholder : c.textSubtle;
    const errColor = isAuthV2 ? v2Tokens.danger : c.danger;

    return StyleSheet.create({
      wrap: { gap: spacing.sm },
      label: { ...typography.captionStrong, color: labelColor },
      requiredMark: { color: errColor },
      trigger: {
        flexDirection: "row",
        alignItems: "center",
        minHeight: 52,
        paddingHorizontal: spacing.md,
        borderRadius: isAuthV2 ? 14 : radius.md,
        borderWidth: 1,
        borderColor: triggerBorder,
        backgroundColor: triggerBg,
        gap: spacing.sm,
      },
      triggerError: {
        borderColor: errColor,
        backgroundColor: isAuthV2 ? v2Tokens.inputBg : c.dangerSoft,
      },
      triggerDisabled: {
        backgroundColor: isAuthV2 ? v2Tokens.inputBg : c.surfaceMuted,
        opacity: 0.72,
      },
      triggerText: { ...typography.body, color: triggerTextColor, flex: 1 },
      triggerPlaceholder: { color: placeholderColor },
      err: { ...typography.caption, color: errColor },
      sheetBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "flex-end",
      },
      sheet: {
        backgroundColor: c.surfaceElevated,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        maxHeight: "72%",
        paddingBottom: Math.max(insets.bottom, spacing.md),
      },
      sheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      sheetTitle: { ...typography.bodyStrong, color: c.text },
      sheetClose: { padding: spacing.xs },
      option: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      optionActive: { backgroundColor: c.primaryLight },
      optionText: { ...typography.body, color: c.text },
      optionTextActive: { color: c.primaryDark, ...typography.bodyStrong },
    });
  });

  const pick = (id: ProfileDesignationId) => {
    applySelection(id, id === "other" ? custom : "");
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.label}>
        {t("onboarding.profile.designationLabel")}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </LocaleUiText>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={t("profile.designation.openListA11y")}
        style={[
          styles.trigger,
          error ? styles.triggerError : null,
          disabled ? styles.triggerDisabled : null,
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            !value.trim() && pickerId !== "other" ? styles.triggerPlaceholder : null,
          ]}
          numberOfLines={1}
        >
          {displayLabel}
        </Text>
        <MaterialCommunityIcons
          name="chevron-down"
          size={22}
          color={isAuthV2 ? v2Tokens.muted : colors.textMuted}
        />
      </Pressable>
      {pickerId === "other" && !disabled ? (
        isAuthV2 ? (
          <OnboardingV2TextField
            label={t("profile.designation.otherLabel")}
            required={required}
            value={custom}
            onChangeText={(text) => applySelection("other", text)}
            placeholder={t("onboarding.profile.designationPlaceholder")}
            autoCapitalize="words"
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={onSubmitEditing}
          />
        ) : (
          <TextField
            label={t("profile.designation.otherLabel")}
            required={required}
            value={custom}
            onChangeText={(text) => applySelection("other", text)}
            placeholder={t("onboarding.profile.designationPlaceholder")}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={onSubmitEditing}
          />
        )
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <LocaleUiText style={styles.sheetTitle}>{t("profile.designation.sheetTitle")}</LocaleUiText>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <FlatList
              data={PROFILE_DESIGNATION_IDS}
              keyExtractor={(id) => id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: id }) => {
                const active = pickerId === id;
                return (
                  <Pressable
                    onPress={() => pick(id)}
                    style={[styles.option, active ? styles.optionActive : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
                      {labelForId(id)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
