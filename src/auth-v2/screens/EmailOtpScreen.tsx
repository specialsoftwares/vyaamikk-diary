import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthTertiaryTextAction } from "@/auth-v2/components/AuthTertiaryTextAction";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingOtpCells } from "@/auth-v2/components/OnboardingOtpCells";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { EMAIL_OTP_LENGTH } from "@/services/auth/emailOtpConstants";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
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
  const { tokens } = useAuthV2Theme();
  const inFlightRef = useRef(false);
  const complete = code.length === EMAIL_OTP_LENGTH;
  const resendBlocked = !canResend || resending || loading || sending;

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
              loadingLabel="Sending OTP…"
              disabled={sending}
              purpose="retry"
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
              purpose="advance"
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
      {sendFailed ? (
        <OnboardingInlineMessage
          tone="danger"
          message={error || "Could not send verification code. Please check the email address and try again."}
        />
      ) : null}
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
          <LocaleUiText style={[styles.resendHint, { color: tokens.secondaryActionMuted }]}>
            {`Resend OTP in ${formatOtpCountdownMmSs(resendRemaining)}`}
          </LocaleUiText>
        ) : (
          <AuthTertiaryTextAction
            label={resending ? t("otp.resending") : t("otp.resend")}
            onPress={() => {
              if (resendBlocked) return;
              onResend();
            }}
            disabled={resendBlocked}
            loading={resending}
            purpose="retry"
            accessibilityLabel="Resend email OTP"
            testID="auth-v2-email-otp-resend"
          />
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 44,
  },
  resendHint: { ...typography.caption },
});
