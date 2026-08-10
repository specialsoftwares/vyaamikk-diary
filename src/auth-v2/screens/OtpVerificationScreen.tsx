import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingOtpCells } from "@/auth-v2/components/OnboardingOtpCells";
import { shouldAutoVerifyOtp } from "@/auth-v2/otp/onboardingOtpModel";
import { onboardingMark } from "@/auth-v2/onboardingPerfProbe";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";
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
  const complete = code.length === MOBILE_OTP_LENGTH;

  const { remainingSeconds: resendRemaining, canResend } =
    useAuthoritativeResendCountdown(resendAvailableAt);
  const lockRemaining = useAuthoritativeCountdown(lockUntil);

  useEffect(() => {
    if (lockRemaining > 0) return;
    if (
      !shouldAutoVerifyOtp({
        digits: code,
        length: MOBILE_OTP_LENGTH,
        lastSubmitted: lastAutoRef.current,
        inFlight: loading || verifyInFlightRef.current,
        disabled: false,
      })
    ) {
      return;
    }
    lastAutoRef.current = code;
    verifyInFlightRef.current = true;
    onboardingMark("otpComplete");
    onboardingMark("verifyStarted");
    try {
      onVerify(code);
    } finally {
      setTimeout(() => {
        verifyInFlightRef.current = false;
      }, 0);
    }
  }, [code, loading, lockRemaining, onVerify]);

  const setDigits = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, MOBILE_OTP_LENGTH);
    setCode(next);
    onDigitsChange?.(next);
    if (next.length < MOBILE_OTP_LENGTH) lastAutoRef.current = null;
  };

  return (
    <AuthShell
      title={t("authV2.otp.title")}
      subtitle={`Code sent to ${displayPhone}`}
      onBack={onChangeNumber}
      headerTop={null}
      footerPlacement="actionZone"
      footer={
        <>
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
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
              <Text style={[styles.retryLink, { color: tokens.link }, loading && { opacity: 0.5 }]}>
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
          <AuthV2PrimaryButton
            label={t("authV2.otp.verify")}
            loading={loading}
            loadingLabel={t("authV2.otp.verifying")}
            disabled={!complete || !online || loading || lockRemaining > 0}
            onPress={() => {
              if (verifyInFlightRef.current || loading) return;
              verifyInFlightRef.current = true;
              onboardingMark("verifyStarted");
              try {
                onVerify(code);
              } finally {
                setTimeout(() => {
                  verifyInFlightRef.current = false;
                }, 0);
              }
            }}
            testID="auth-v2-otp-verify"
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
        </>
      }
    >
      <OnboardingOtpCells
        value={code}
        length={MOBILE_OTP_LENGTH}
        onChange={setDigits}
        disabled={loading || lockRemaining > 0}
        error={Boolean(error)}
        testID="auth-v2-otp-input"
        accessibilityLabel="One-time password"
      />

      <View style={styles.resendRow}>
        {resendRemaining > 0 ? (
          <LocaleUiText style={[styles.resendHint, { color: tokens.muted }]}>
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
            disabled={resending || loading || (resendAvailableAt != null && !canResend)}
            accessibilityRole="button"
            accessibilityLabel="Resend OTP"
          >
            <Text style={[styles.resendLink, { color: tokens.link }, resending && { opacity: 0.5 }]}>
              {resending ? t("otp.resending") : "Resend OTP"}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable onPress={onChangeNumber} style={styles.changeNumber} accessibilityRole="button">
        <LocaleUiText style={[styles.changeNumberText, { color: tokens.link }]}>
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
    minHeight: 28,
  },
  resendHint: { ...typography.caption },
  resendLink: { ...typography.captionStrong },
  retryWrap: { alignItems: "center", paddingVertical: spacing.xs },
  retryLink: { ...typography.captionStrong },
  changeNumber: { alignItems: "center", paddingVertical: spacing.sm },
  changeNumberText: { ...typography.captionStrong },
});
