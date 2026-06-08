import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getAuthEntryHref } from "@/config/authWrapper";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles, useThemeColors } from "@/theme";

interface OnboardingBackHeaderProps {
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export function OnboardingBackHeader({ onBack, rightSlot }: OnboardingBackHeaderProps) {
  const t = useT();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
      },
      backBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingVertical: spacing.xs,
        paddingRight: spacing.sm,
      },
      backText: { ...typography.captionStrong, color: c.primary },
    })
  );

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(getAuthEntryHref());
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={goBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.primary} />
        <LocaleUiText style={styles.backText}>{t("common.back")}</LocaleUiText>
      </Pressable>
      {rightSlot ?? null}
    </View>
  );
}
