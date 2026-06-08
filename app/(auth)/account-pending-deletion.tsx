import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";

import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { Banner, Button, Screen, LocaleUiText } from "@/components/ui";
import { DELETION_GRACE_DAYS } from "@/domain/identityLifecycle";
import { userFacingMessage } from "@/domain/errors";
import { getAuthEntryHref } from "@/config/authWrapper";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { maskMobile } from "@/utils/phone";

export default function AccountPendingDeletionScreen() {
  const t = useT();
  const router = useRouter();
  const { cancelAccountDeletion } = useAuth();
  const params = useLocalSearchParams<{
    phoneE164?: string;
    deletionScheduledFor?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneE164 = String(params.phoneE164 ?? "");
  const scheduledMs = Number(params.deletionScheduledFor ?? 0);
  const scheduledLabel =
    scheduledMs > 0 ? format(scheduledMs, "d MMM yyyy") : t("pendingDeletion.dateUnknown");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      meta: {
        ...typography.body,
        color: c.textMuted,
        lineHeight: 22,
        marginTop: spacing.md,
      },
      actions: { gap: spacing.sm, marginTop: spacing.lg },
    })
  );

  const onCancelDeletion = async () => {
    if (!phoneE164) return;
    setBusy(true);
    setError(null);
    try {
      await cancelAccountDeletion(phoneE164);
      Alert.alert(t("pendingDeletion.cancelSuccessTitle"), t("pendingDeletion.cancelSuccessBody"), [
        {
          text: t("common.ok"),
          onPress: () => router.replace(getAuthEntryHref()),
        },
      ]);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded>
      <OnboardingStepShell
        stepLabel={t("pendingDeletion.step")}
        title={t("pendingDeletion.title")}
        body={t("pendingDeletion.body", {
          phone: phoneE164 ? maskMobile(phoneE164) : "—",
          days: DELETION_GRACE_DAYS,
          date: scheduledLabel,
        })}
        footer={
          <View style={styles.actions}>
            {error ? <Banner tone="danger" message={error} /> : null}
            <Button
              label={t("pendingDeletion.cancelDeletion")}
              onPress={() => void onCancelDeletion()}
              loading={busy}
            />
            <Button
              label={t("pendingDeletion.backToLogin")}
              variant="ghost"
              onPress={() => router.replace(getAuthEntryHref())}
              disabled={busy}
            />
          </View>
        }
      >
        <LocaleUiText style={styles.meta}>{t("pendingDeletion.footnote")}</LocaleUiText>
      </OnboardingStepShell>
    </Screen>
  );
}
