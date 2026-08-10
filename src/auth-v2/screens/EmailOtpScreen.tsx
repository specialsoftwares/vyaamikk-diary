import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingOtpCells } from "@/auth-v2/components/OnboardingOtpCells";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { EMAIL_OTP_LENGTH } from "@/services/auth/emailOtpConstants";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";
import { formatOtpCountdownMmSs } from "@/utils/otpCountdownFormat";

interface EmailOtpScreenProps {
  email: string;
  code: string;
  onCodeChange: (digits: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onRetrySend?: () => void;
  onBack: () => void;
  sending?: boolean;
  sendFailed?: boolean;
  loading?: boolean;
  resending?: boolean;
  canVerify?: boolean;
  resendRemaining?: number;
  canResend?: boolean;
  validityRemaining?: number;
  expired?: boolean;
  error?: string | null;
}

export function EmailOtpScreen({
  email,
  code,
  onCodeChange,
  onVerify,
  onResend,
  onRetrySend,
  onBack,
  sending = false,
  sendFailed = false,
  loading = false,
  resending = false,
  canVerify = false,
  resendRemaining = 0,
  canResend = false,
  validityRemaining = 0,
  expired = false,
  error = null,
}: EmailOtpScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const inFlightRef = useRef(false);
  const complete = code.length === EMAIL_OTP_LENGTH;

  return (
    <AuthShell
      title={t("authV2.emailOtp.title")}
      subtitle={email}
      onBack={onBack}
      headerTop={null}
      footerPlacement="actionZone"
      footer={
        <>
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
          {sendFailed ? (
            <AuthV2PrimaryButton
              label="Retry sending"
              onPress={onRetrySend}
              loading={sending}
              disabled={sending}
              activeBg={tokens.ctaActiveBg}
              activeText={tokens.ctaActiveText}
              mutedBg={tokens.ctaMutedBg}
              mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
            />
          ) : (
            <AuthV2PrimaryButton
              label={t("authV2.emailOtp.verify")}
              loading={loading || sending}
              loadingLabel={sending ? "Sending OTP…" : t("authV2.emailOtp.verifying")}
              disabled={!complete || !online || loading || !canVerify || sending}
              onPress={() => {
                if (inFlightRef.current || loading) return;
                inFlightRef.current = true;
                try {
                  onVerify();
                } finally {
                  setTimeout(() => {
                    inFlightRef.current = false;
                  }, 0);
                }
              }}
              testID="auth-v2-email-otp-verify"
              activeBg={tokens.ctaActiveBg}
              activeText={tokens.ctaActiveText}
              mutedBg={tokens.ctaMutedBg}
              mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
            />
          )}
        </>
      }
    >
      {sending ? <OnboardingInlineMessage tone="info" message="Sending OTP…" /> : null}
      {sendFailed ? <OnboardingInlineMessage tone="danger" message="OTP could not be sent" /> : null}
      {!sending && !sendFailed && validityRemaining > 0 ? (
        <OnboardingInlineMessage
          tone="muted"
          message={`Code valid for ${formatOtpCountdownMmSs(validityRemaining)}`}
        />
      ) : null}
      {!sending && !sendFailed && expired ? (
        <OnboardingInlineMessage tone="danger" message="Code expired — request a new one." />
      ) : null}
      {error && !sendFailed ? <OnboardingInlineMessage tone="danger" message={error} /> : null}

      <OnboardingOtpCells
        value={code}
        length={EMAIL_OTP_LENGTH}
        onChange={onCodeChange}
        disabled={loading || sending}
        error={Boolean(error)}
        testID="auth-v2-email-otp-input"
        accessibilityLabel="Email verification code"
      />

      <View style={styles.resendRow}>
        {resendRemaining > 0 ? (
          <LocaleUiText style={[styles.resendHint, { color: tokens.muted }]}>
            {`Resend OTP in ${formatOtpCountdownMmSs(resendRemaining)}`}
          </LocaleUiText>
        ) : (
          <Pressable
            onPress={() => {
              if (!canResend || resending || loading || sending) return;
              onResend();
            }}
            disabled={!canResend || resending || loading || sending}
            accessibilityRole="button"
            accessibilityLabel="Resend email OTP"
          >
            <Text style={[styles.resendLink, { color: tokens.link }, resending && { opacity: 0.5 }]}>
              {resending ? t("otp.resending") : t("otp.resend")}
            </Text>
          </Pressable>
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 28,
  },
  resendHint: { ...typography.caption },
  resendLink: { ...typography.captionStrong },
});
