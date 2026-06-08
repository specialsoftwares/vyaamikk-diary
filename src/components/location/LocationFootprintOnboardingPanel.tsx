import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export interface LocationFootprintOnboardingPanelProps {
  busy?: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

/** Optional location footprints — native OS prompt only after Allow. */
export function LocationFootprintOnboardingPanel({
  busy = false,
  onAllow,
  onNotNow,
}: LocationFootprintOnboardingPanelProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      noteCard: {
        backgroundColor: c.surfaceMuted,
        borderRadius: 12,
        padding: spacing.md,
        gap: spacing.xs,
      },
      note: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      actions: { gap: spacing.sm },
    })
  );

  return (
    <OnboardingStepShell
      stepLabel={t("onboarding.stages.businessFootprint")}
      title={t("onboarding.location.title")}
      body={t("onboarding.location.body")}
      footer={
        <View style={styles.actions}>
          <PremiumActionButton
            label={t("onboarding.location.allow")}
            onPress={onAllow}
            loading={busy}
            disabled={busy}
          />
          <PremiumActionButton
            label={t("onboarding.location.notNow")}
            variant="secondary"
            onPress={onNotNow}
            disabled={busy}
          />
        </View>
      }
    >
      <View style={styles.noteCard}>
        <LocaleUiText style={styles.note}>{t("onboarding.location.footnote")}</LocaleUiText>
      </View>
    </OnboardingStepShell>
  );
}
