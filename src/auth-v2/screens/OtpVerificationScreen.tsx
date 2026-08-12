import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingOtpCells } from "@/auth-v2/components/OnboardingOtpCells";
import {
  OTP_OFFLINE_VERIFY_MESSAGE,
  classifyOtpVerifyFailure,
  resolveOtpVerifyUi,
  shouldAutoVerifyOtp,
} from "@/auth-v2/otp/onboardingOtpModel";
import { onboardingMark } from "@/auth-v2/onboardingPerfProbe";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { LocaleUiText } from "@/components/ui";
import { PhoneAuthErrorPanel } from "@/auth-v2/components/PhoneAuthErrorPanel";
import { formatDisplayPhone } from "@/utils/phone";
import {
  useAuthoritativeCountdown,
  useAuthoritativeResendCountdown,
} from "@/hooks/useAuthoritativeResendCountdown";
import { formatOtpCountdownMmSs } from "@/utils/otpCountdownFormat";
import { MOBILE_OTP_LENGTH } from "@/services/auth/mobileOtpConstants";

interface OtpVerificationScreenProps {
  phoneE164: string;
  /** Ignored for UI — deterministic OTP must stay hidden. */
  devCodeHint?: string | null;
  /** @deprecated Visible validity countdown removed; internal TTL remains elsewhere. */
  expiresAt?: number | null;
  resendAvailableAt?: number | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  loading?: boolean;
  resending?: boolean;
  error?: string | null;
  errorTitle?: string | null;
  errorDiagnostic?: string | null;
  /** AppError.code from last verify/send failure — recovery chrome only. */
  errorCode?: string | null;
  onCopyErrorDiagnostics?: () => void;
  /** Post-auth identity retry without requesting a new SMS. */
  onRetryAccountSetup?: () => void;
  /** When lockUntil > now, show lock countdown instead of OTP entry actions. */
  lockUntil?: number | null;
  initialDigits?: string;
  onDigitsChange?: (digits: string) => void;
}

export function OtpVerificationScreen({
  phoneE164,
  resendAvailableAt = null,
  onVerify,
  onResend,
  onChangeNumber,
  loading = false,
  resending = false,
  error = null,
  errorTitle = null,
  errorDiagnostic = null,
  errorCode = null,
  onCopyErrorDiagnostics,
  onRetryAccountSetup,
  lockUntil = null,
  initialDigits = "",
  onDigitsChange,
}: OtpVerificationScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const [code, setCode] = useState(initialDigits);
  const lastAutoRef = useRef<string | null>(null);
  const verifyInFlightRef = useRef(false);

  const displayPhone = formatDisplayPhone(phoneE164);

  const { remainingSeconds: resendRemaining, canResend } =
    useAuthoritativeResendCountdown(resendAvailableAt);
  const lockRemaining = useAuthoritativeCountdown(lockUntil);
  const failureKind = classifyOtpVerifyFailure(errorCode);
  const ui = resolveOtpVerifyUi({
    digits: code,
    length: MOBILE_OTP_LENGTH,
    online,
    loading,
    lockRemaining,
    lastSubmitted: lastAutoRef.current,
    failureKind,
  });

  const invokeVerify = (nextCode: string) => {
    if (verifyInFlightRef.current || loading) return;
    lastAutoRef.current = nextCode;
    verifyInFlightRef.current = true;
    onboardingMark("otpComplete");
    onboardingMark("verifyStarted");
    try {
      onVerify(nextCode);
    } finally {
      setTimeout(() => {
        verifyInFlightRef.current = false;
      }, 0);
    }
  };

  useEffect(() => {
    if (lockRemaining > 0) return;
    if (
      !shouldAutoVerifyOtp({
        digits: code,
        length: MOBILE_OTP_LENGTH,
        lastSubmitted: lastAutoRef.current,
        inFlight: loading || verifyInFlightRef.current,
        disabled: ui.autoVerifyDisabled,
      })
    ) {
      return;
    }
    invokeVerify(code);
    // invokeVerify is stable enough for this screen; lastAutoRef guards duplicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lastAutoRef + shouldAutoVerifyOtp are the guards
  }, [code, loading, lockRemaining, onVerify, online, ui.autoVerifyDisabled]);

  const setDigits = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, MOBILE_OTP_LENGTH);
    setCode(next);
    onDigitsChange?.(next);
    if (next.length < MOBILE_OTP_LENGTH) lastAutoRef.current = null;
  };

  const resendBlocked = resending || loading || (resendAvailableAt != null && !canResend);
  const showFooter =
    !online ||
    Boolean(error || errorDiagnostic) ||
    Boolean(onRetryAccountSetup) ||
    lockRemaining > 0 ||
    ui.showManualVerifyCta;

  return (
    <AuthShell
      title={t("authV2.otp.title")}
      subtitle={`Code sent to ${displayPhone}`}
      onBack={onChangeNumber}
      headerTop={null}
      footerPlacement="actionZone"
      footer={
        showFooter ? (
          <>
            {!online ? (
              <OnboardingInlineMessage
                tone="info"
                message={OTP_OFFLINE_VERIFY_MESSAGE}
                testID="auth-v2-otp-offline"
              />
            ) : null}
            <PhoneAuthErrorPanel
              title={errorTitle}
              message={error}
              diagnostic={errorDiagnostic}
              onCopyDiagnostics={onCopyErrorDiagnostics}
            />
            {onRetryAccountSetup ? (
              <Pressable
                onPress={onRetryAccountSetup}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Try account setup again"
                style={styles.retryWrap}
              >
                <Text
                  style={[styles.retryLink, { color: tokens.secondaryAction }, loading && { opacity: 0.5 }]}
                >
                  Try again (no new SMS)
                </Text>
              </Pressable>
            ) : null}
            {lockRemaining > 0 ? (
              <OnboardingInlineMessage
                tone="danger"
                message={`Try again in ${formatOtpCountdownMmSs(lockRemaining)}`}
              />
            ) : null}
            {ui.showManualVerifyCta ? (
              <AuthV2PrimaryButton
                label={t("common.retry")}
                loading={loading}
                loadingLabel={t("authV2.otp.verifying")}
                disabled={!online || loading || lockRemaining > 0}
                onPress={() => invokeVerify(code)}
                testID="auth-v2-otp-verify"
                activeBg={tokens.ctaActiveBg}
                activeText={tokens.ctaActiveText}
                mutedBg={tokens.ctaMutedBg}
                mutedText={tokens.ctaMutedText}
                mutedBorder={tokens.ctaMutedBorder}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      <OnboardingOtpCells
        value={code}
        length={MOBILE_OTP_LENGTH}
        onChange={setDigits}
        disabled={loading || lockRemaining > 0}
        error={Boolean(error)}
        testID="auth-v2-otp-input"
        accessibilityLabel={
          loading ? "One-time password. Verifying your code." : "One-time password"
        }
      />

      <View style={styles.resendRow}>
        {resendRemaining > 0 ? (
          <LocaleUiText
            style={[styles.resendHint, { color: tokens.secondaryActionMuted }]}
            accessibilityLabel={`Resend OTP in ${formatOtpCountdownMmSs(resendRemaining)}`}
          >
            {`Resend OTP in ${formatOtpCountdownMmSs(resendRemaining)}`}
          </LocaleUiText>
        ) : (
          <Pressable
            onPress={() => {
              if (!canResend && resendAvailableAt != null) return;
              if (resending || loading) return;
              setDigits("");
              onResend();
            }}
            disabled={resendBlocked}
            accessibilityRole="button"
            accessibilityLabel="Resend OTP"
            accessibilityState={{ disabled: resendBlocked }}
            hitSlop={8}
            style={styles.secondaryHit}
          >
            <Text
              style={[
                styles.resendLink,
                { color: resendBlocked ? tokens.secondaryActionMuted : tokens.secondaryAction },
              ]}
            >
              {resending ? t("otp.resending") : "Resend OTP"}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={onChangeNumber}
        style={styles.changeNumber}
        accessibilityRole="button"
        accessibilityLabel={t("authV2.otp.changeNumber")}
        hitSlop={8}
      >
        <LocaleUiText style={[styles.changeNumberText, { color: tokens.tertiaryAction }]}>
          {t("authV2.otp.changeNumber")}
        </LocaleUiText>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 44,
  },
  secondaryHit: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  resendHint: { ...typography.captionStrong },
  resendLink: { ...typography.captionStrong },
  retryWrap: { alignItems: "center", paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  retryLink: { ...typography.captionStrong },
  changeNumber: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  changeNumberText: { ...typography.caption },
});
