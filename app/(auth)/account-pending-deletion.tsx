import React, { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";

import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { Banner, Button, Screen, LocaleUiText } from "@/components/ui";
import { DELETION_GRACE_DAYS } from "@/domain/identityLifecycle";
import { AppError, userFacingMessage } from "@/domain/errors";
import { getAuthEntryHref } from "@/config/authWrapper";
import { getActiveBackend } from "@/config/env";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { maskMobile } from "@/utils/phone";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import {
  callCompleteAccountReactivation,
  callStartAccountReactivation,
  useIdentityCallables,
} from "@/services/auth/identityCallable";
import { useAuthoritativeResendCountdown } from "@/hooks/useAuthoritativeResendCountdown";
import { useIsOnline } from "@/state/network";

const EMAIL_CODE_LENGTH = 6;

type ScreenStep = "info" | "email_verify";

export default function AccountPendingDeletionScreen() {
  const t = useT();
  const router = useRouter();
  const { cancelAccountDeletion, finishReactivation, signOut } = useAuth();
  const params = useLocalSearchParams<{
    phoneE164?: string;
    deletionScheduledFor?: string;
    maskedEmail?: string;
  }>();
  const [step, setStep] = useState<ScreenStep>("info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState(String(params.maskedEmail ?? ""));
  const [emailCode, setEmailCode] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const codeInputRef = useRef<TextInput>(null);
  const online = useIsOnline();
  const resend = useAuthoritativeResendCountdown(resendAvailableAt);

  const phoneE164 = String(params.phoneE164 ?? "");
  const scheduledMs = Number(params.deletionScheduledFor ?? 0);
  const scheduledLabel =
    scheduledMs > 0 ? format(scheduledMs, "d MMM yyyy") : t("pendingDeletion.dateUnknown");
  const useReactivationFlow =
    useIdentityCallables() && getActiveBackend() === "firebase-production";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      meta: {
        ...typography.body,
        color: c.textMuted,
        lineHeight: 22,
        marginTop: spacing.md,
      },
      actions: { gap: spacing.sm, marginTop: spacing.lg },
      emailHint: {
        ...typography.body,
        color: c.textMuted,
        lineHeight: 22,
        marginBottom: spacing.md,
      },
      codeInput: {
        ...typography.mono,
        fontSize: 24,
        letterSpacing: 6,
        textAlign: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.divider,
        color: c.text,
        marginBottom: spacing.md,
        ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
      },
    })
  );

  const onBackToLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      router.replace(getAuthEntryHref());
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setBusy(false);
    }
  };

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

  const reactivationMessage = (error: unknown): string => {
    const code = error instanceof AppError ? String(error.details?.code ?? "") : "";
    if (code === "expired") return t("pendingDeletion.reactivateExpired");
    if (code === "attempts_exhausted" || code === "rate_limited" || code === "cooldown") {
      return t("pendingDeletion.reactivateAttempts");
    }
    if (code === "superseded") return t("pendingDeletion.reactivateLatestCode");
    if (code === "provider_unavailable") return t("pendingDeletion.reactivateSendFailed");
    if (code === "no_verified_email" || code === "purge_underway" || code === "ineligible") {
      return t("pendingDeletion.reactivateUnavailable");
    }
    return userFacingMessage(error);
  };

  const onStartReactivation = async () => {
    if (!online) {
      setError(t("pendingDeletion.reactivateOffline"));
      return;
    }
    const generation = currentAuthMutationGeneration();
    setBusy(true);
    setError(null);
    try {
      const result = await callStartAccountReactivation();
      if (currentAuthMutationGeneration() !== generation) return;
      setVerificationId(result.verificationId);
      setMaskedEmail(result.maskedEmail);
      setResendAvailableAt(result.resendAvailableAt);
      setEmailCode("");
      setStep("email_verify");
      setTimeout(() => codeInputRef.current?.focus(), 280);
    } catch (e) {
      if (currentAuthMutationGeneration() !== generation) return;
      setError(reactivationMessage(e));
    } finally {
      if (currentAuthMutationGeneration() === generation) setBusy(false);
    }
  };

  const onVerifyEmailAndReactivate = async () => {
    if (!online) {
      setError(t("pendingDeletion.reactivateOffline"));
      return;
    }
    if (!verificationId || emailCode.length !== EMAIL_CODE_LENGTH) return;
    const generation = currentAuthMutationGeneration();
    const submitted = emailCode;
    setBusy(true);
    setError(null);
    try {
      const { profile } = await callCompleteAccountReactivation(verificationId, submitted);
      if (currentAuthMutationGeneration() !== generation) return;
      await finishReactivation(profile);
      if (currentAuthMutationGeneration() !== generation) return;
      setEmailCode("");
      Alert.alert(
        t("pendingDeletion.reactivateSuccessTitle"),
        t("pendingDeletion.reactivateSuccessBody"),
        [{ text: t("common.ok"), onPress: () => router.replace("/") }]
      );
    } catch (e) {
      if (currentAuthMutationGeneration() !== generation) return;
      setError(reactivationMessage(e));
    } finally {
      if (currentAuthMutationGeneration() === generation) setBusy(false);
    }
  };

  const emailVerifyComplete = emailCode.length === EMAIL_CODE_LENGTH;

  if (step === "email_verify") {
    return (
      <Screen scroll padded>
        <OnboardingStepShell
          stepLabel={t("pendingDeletion.reactivateStep")}
          title={t("pendingDeletion.reactivateEmailTitle")}
          body={t("pendingDeletion.reactivateEmailBody", { email: maskedEmail || "—" })}
          footer={
            <View style={styles.actions}>
              {error ? <Banner tone="danger" message={error} /> : null}
              <TextInput
                ref={codeInputRef}
                style={styles.codeInput}
                value={emailCode}
                onChangeText={(text) =>
                  setEmailCode(text.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH))
                }
                keyboardType="number-pad"
                maxLength={EMAIL_CODE_LENGTH}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                placeholder={t("otp.codePlaceholder")}
                editable={!busy}
                allowFontScaling
                maxFontSizeMultiplier={2}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (emailVerifyComplete) void onVerifyEmailAndReactivate();
                }}
              />
              <Button
                label={t("pendingDeletion.verifyAndReactivate")}
                onPress={() => void onVerifyEmailAndReactivate()}
                loading={busy}
                disabled={!emailVerifyComplete}
              />
              <Button
                label={
                  resend.canResend
                    ? t("pendingDeletion.reactivateResend")
                    : t("pendingDeletion.reactivateResendIn", { seconds: resend.remainingSeconds })
                }
                variant="ghost"
                onPress={() => void onStartReactivation()}
                disabled={busy || !resend.canResend || !online}
              />
              <Button
                label={t("pendingDeletion.backToLogin")}
                variant="ghost"
                onPress={() => {
                  setEmailCode("");
                  void onBackToLogin();
                }}
                disabled={busy}
              />
            </View>
          }
        >
          <LocaleUiText style={styles.emailHint}>
            {t("pendingDeletion.reactivateEmailHint")}
          </LocaleUiText>
        </OnboardingStepShell>
      </Screen>
    );
  }

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
            {useReactivationFlow ? (
              <Button
                label={t("pendingDeletion.reactivateAccount")}
                onPress={() => void onStartReactivation()}
                loading={busy}
              />
            ) : (
              <Button
                label={t("pendingDeletion.cancelDeletion")}
                onPress={() => void onCancelDeletion()}
                loading={busy}
              />
            )}
            <Button
              label={t("pendingDeletion.backToLogin")}
              variant="ghost"
              onPress={() => void onBackToLogin()}
              disabled={busy}
            />
          </View>
        }
      >
        <LocaleUiText style={styles.meta}>
          {useReactivationFlow
            ? t("pendingDeletion.reactivateFootnote")
            : t("pendingDeletion.footnote")}
        </LocaleUiText>
      </OnboardingStepShell>
    </Screen>
  );
}
