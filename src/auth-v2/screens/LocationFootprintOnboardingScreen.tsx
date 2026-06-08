import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";

interface LocationFootprintOnboardingScreenProps {
  busy?: boolean;
  onAllow: () => void;
  onNotNow: () => void;
  onBack?: () => void;
}

export function LocationFootprintOnboardingScreen({
  busy = false,
  onAllow,
  onNotNow,
  onBack,
}: LocationFootprintOnboardingScreenProps) {
  const t = useT();
  const { tokens } = useAuthV2Theme();

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.businessFootprint")}
      title={t("onboarding.location.title")}
      subtitle={t("onboarding.location.body")}
      onBack={onBack}
      footer={
        <View style={styles.actions}>
          <AuthV2PrimaryButton
            label={t("onboarding.location.allow")}
            onPress={onAllow}
            loading={busy}
            disabled={busy}
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
          />
          <AuthV2SecondaryButton
            label={t("onboarding.location.notNow")}
            onPress={onNotNow}
            disabled={busy}
          />
        </View>
      }
    >
      <View
        style={[
          styles.noteCard,
          { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder },
        ]}
      >
        <LocaleUiText style={[styles.note, { color: tokens.body }]}>{t("onboarding.location.footnote")}</LocaleUiText>
      </View>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  note: { ...typography.caption, lineHeight: 20 },
});
