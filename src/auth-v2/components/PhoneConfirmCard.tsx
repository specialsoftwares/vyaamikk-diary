import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";

interface PhoneConfirmCardProps {
  displayPhone: string;
  onConfirm: () => void;
  onBack: () => void;
  loading?: boolean;
}

export function PhoneConfirmCard({
  displayPhone,
  onConfirm,
  onBack,
  loading = false,
}: PhoneConfirmCardProps) {
  const t = useT();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
      ]}
    >
      <LocaleUiText style={[styles.question, { color: tokens.heading }]}>
        {t("authV2.confirm.question")}
      </LocaleUiText>
      <Text style={[styles.phone, { color: tokens.heading }]}>{displayPhone}</Text>
      <LocaleUiText style={[styles.hint, { color: tokens.body }]}>{t("authV2.confirm.hint")}</LocaleUiText>
      <AuthV2PrimaryButton
        label={t("authV2.confirm.confirm")}
        loading={loading}
        loadingLabel={t("authV2.phone.sending")}
        onPress={onConfirm}
        activeBg={tokens.ctaActiveBg}
        activeText={tokens.ctaActiveText}
        mutedBg={tokens.ctaMutedBg}
        mutedText={tokens.ctaMutedText}
      />
      <AuthV2PrimaryButton
        label={t("authV2.confirm.goBack")}
        onPress={onBack}
        disabled={loading}
        activeBg={tokens.ctaMutedBg}
        activeText={tokens.heading}
        mutedBg={tokens.ctaMutedBg}
        mutedText={tokens.ctaMutedText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  question: { ...typography.titleSm, textAlign: "center" },
  phone: {
    ...typography.titleMd,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  hint: { ...typography.caption, textAlign: "center", lineHeight: 20 },
});
