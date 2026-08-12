import React, { useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { markReviewingWizardStep, clearWizardNavigationSession } from "@/auth/onboardingGuardPolicy";
import { env } from "@/config/env";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";

interface UeidReleaseOnboardingScreenProps {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
}

export function UeidReleaseOnboardingScreen({ user }: UeidReleaseOnboardingScreenProps) {
  const t = useT();
  const router = useRouter();
  const { tokens } = useAuthV2Theme();
  const { updateProfile, acknowledgeUEID } = useAuth();
  const [copied, setCopied] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(user.ueid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onContinue = async () => {
    setContinuing(true);
    try {
      // Optional acknowledgement if this dormant surface is shown — not required for app entry.
      if (!user.ueidReleasedAt) {
        await updateProfile({ ueidReleasedAt: Date.now() });
      }
      acknowledgeUEID();
      clearWizardNavigationSession();
      router.replace("/(app)/(tabs)/you");
    } finally {
      setContinuing(false);
    }
  };

  const onBackToProfile = () => {
    markReviewingWizardStep("businessIdentity", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail,
    });
    router.replace("/(auth)/complete-profile");
  };

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.ueidReady")}
      title={t("onboarding.ueid.title")}
      subtitle={t("onboarding.ueid.body", { phone: maskMobile(user.phoneE164) })}
      onBack={onBackToProfile}
      footer={
        <>
          <AuthV2PrimaryButton
            label={t("onboarding.ueid.continue")}
            onPress={() => void onContinue()}
            loading={continuing}
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
          <LocaleUiText style={[styles.continueRequired, { color: tokens.muted }]}>
            {t("onboarding.ueid.continueRequired")}
          </LocaleUiText>
        </>
      }
    >
      <View
        style={[
          styles.ueidCard,
          { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
        ]}
      >
        <LocaleUiText style={[styles.ueidLabel, { color: tokens.muted }]}>{t("ueid.label")}</LocaleUiText>
        <Text style={[styles.ueidValue, { color: tokens.heading }]} selectable>
          {user.ueid}
        </Text>
        <Pressable onPress={() => void onCopy()} accessibilityRole="button">
          <LocaleUiText style={[styles.copyLink, { color: tokens.link }]}>
            {copied ? t("ueid.copied") : t("ueid.copy")}
          </LocaleUiText>
        </Pressable>
        <LocaleUiText style={[styles.meta, { color: tokens.muted }]}>
          {t("onboarding.ueid.linked", { owner: env.brand.owner })}
        </LocaleUiText>
      </View>
      <LocaleUiText style={[styles.info, { color: tokens.body }]}>{t("onboarding.ueid.info")}</LocaleUiText>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  ueidCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ueidLabel: { ...typography.micro, letterSpacing: 1.5 },
  ueidValue: {
    ...typography.mono,
    fontSize: 24,
    textAlign: "center",
  },
  copyLink: { ...typography.captionStrong, marginTop: spacing.xs },
  meta: { ...typography.caption, textAlign: "center", lineHeight: 18 },
  info: {
    ...typography.caption,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
  },
  continueRequired: {
    ...typography.caption,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.xs,
  },
});
