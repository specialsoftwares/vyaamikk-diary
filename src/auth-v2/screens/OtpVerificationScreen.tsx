import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";
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
  expiresAt?: number | null;
  resendAvailableAt?: number | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  loading?: boolean;
  resending?: boolean;
  error?: string | null;
  /** When lockUntil > now, show lock countdown instead of OTP entry actions. */
  lockUntil?: number | null;
  initialDigits?: string;
  onDigitsChange?: (digits: string) => void;
}

export function OtpVerificationScreen({
  phoneE164,
  expiresAt = null,
  resendAvailableAt = null,
  onVerify,
  onResend,
  onChangeNumber,
  loading = false,
  resending = false,
  error = null,
  lockUntil = null,
  initialDigits = "",
  onDigitsChange,
}: OtpVerificationScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState(initialDigits);
  const lastAutoRef = useRef<string | null>(null);
  const verifyInFlightRef = useRef(false);

  const displayPhone = formatDisplayPhone(phoneE164);
  const complete = code.length === MOBILE_OTP_LENGTH;

  const validityRemaining = useAuthoritativeCountdown(expiresAt);
  const { remainingSeconds: resendRemaining, canResend } =
    useAuthoritativeResendCountdown(resendAvailableAt);
  const lockRemaining = useAuthoritativeCountdown(lockUntil);

  useEffect(() => {
    const tmr = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    if (lockRemaining > 0) return;
    if (!complete || loading || verifyInFlightRef.current) return;
    if (lastAutoRef.current === code) return;
    lastAutoRef.current = code;
    verifyInFlightRef.current = true;
    try {
      onVerify(code);
    } finally {
      // Parent sets loading; release local lock on next tick if sync throw.
      setTimeout(() => {
        verifyInFlightRef.current = false;
      }, 0);
    }
  }, [code, complete, loading, lockRemaining, onVerify]);

  const setDigits = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, MOBILE_OTP_LENGTH);
    setCode(next);
    onDigitsChange?.(next);
    if (next.length < MOBILE_OTP_LENGTH) lastAutoRef.current = null;
  };

  const expired = expiresAt != null && validityRemaining <= 0;

  return (
    <AuthShell
      title={t("authV2.otp.title")}
      subtitle={`Code sent to ${displayPhone}`}
      onBack={onChangeNumber}
      footer={
        <>
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}
          {lockRemaining > 0 ? (
            <Banner
              tone="danger"
              message={`Try again in ${formatOtpCountdownMmSs(lockRemaining)}`}
            />
          ) : null}
          <AuthV2PrimaryButton
            label={t("authV2.otp.verify")}
            loading={loading}
            loadingLabel={t("authV2.otp.verifying")}
            disabled={!complete || !online || loading || lockRemaining > 0 || expired}
            onPress={() => {
              if (verifyInFlightRef.current || loading) return;
              verifyInFlightRef.current = true;
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
          />
        </>
      }
    >
      {expiresAt != null ? (
        <LocaleUiText style={[styles.timing, { color: tokens.muted }]}>
          {expired
            ? "OTP expired"
            : `Code valid for ${formatOtpCountdownMmSs(validityRemaining)}`}
        </LocaleUiText>
      ) : null}

      <TextInput
        ref={inputRef}
        style={[
          styles.otpInput,
          {
            backgroundColor: tokens.inputBg,
            borderColor: tokens.inputBorder,
            color: tokens.inputText,
          },
        ]}
        value={code}
        onChangeText={setDigits}
        keyboardType="number-pad"
        maxLength={MOBILE_OTP_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        placeholder={t("otp.codePlaceholder")}
        placeholderTextColor={tokens.placeholder}
        editable={!loading && lockRemaining <= 0 && !expired}
        returnKeyType="done"
        blurOnSubmit={false}
        accessibilityLabel="One-time password"
        onSubmitEditing={() => {
          if (complete && !loading) onVerify(code);
        }}
        testID="auth-v2-otp-input"
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
            disabled={resending || loading || (resendAvailableAt != null && !canResend && !expired)}
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
  timing: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  otpInput: {
    ...typography.mono,
    fontSize: 28,
    lineHeight: Platform.OS === "ios" ? 34 : 36,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.lg,
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 28,
  },
  resendHint: { ...typography.caption },
  resendLink: { ...typography.captionStrong },
  changeNumber: { alignItems: "center", paddingVertical: spacing.sm },
  changeNumberText: { ...typography.captionStrong },
});
