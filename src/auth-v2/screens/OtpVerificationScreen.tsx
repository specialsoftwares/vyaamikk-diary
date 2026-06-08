import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { env } from "@/config/env";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";
import { maskMobile } from "@/utils/phone";

const RESEND_SECONDS = 30;
const OTP_LENGTH = 6;

interface OtpVerificationScreenProps {
  phoneE164: string;
  devCodeHint: string | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  loading?: boolean;
  resending?: boolean;
  error?: string | null;
}

export function OtpVerificationScreen({
  phoneE164,
  devCodeHint,
  onVerify,
  onResend,
  onChangeNumber,
  loading = false,
  resending = false,
  error = null,
}: OtpVerificationScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS);

  const complete = code.length === OTP_LENGTH;

  useEffect(() => {
    const tmr = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => setResendCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleResend = () => {
    if (resendCountdown > 0 || resending) return;
    setResendCountdown(RESEND_SECONDS);
    setCode("");
    onResend();
  };

  return (
    <AuthShell
      title={t("authV2.otp.title")}
      subtitle={t("authV2.otp.subtitle", { phone: maskMobile(phoneE164) })}
      onBack={onChangeNumber}
      footer={
        <>
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
          {devCodeHint && env.isDevelopment ? (
            <Banner tone="info" title={t("otp.devTitle")} message={t("otp.devBody", { code: devCodeHint })} />
          ) : null}
          {error ? <Banner tone="danger" message={error} /> : null}
          <AuthV2PrimaryButton
            label={t("authV2.otp.verify")}
            loading={loading}
            loadingLabel={t("authV2.otp.verifying")}
            disabled={!complete || !online}
            onPress={() => onVerify(code)}
            testID="auth-v2-otp-verify"
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
          />
        </>
      }
    >
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
        onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        placeholder={t("otp.codePlaceholder")}
        placeholderTextColor={tokens.placeholder}
        editable={!loading}
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          if (complete) onVerify(code);
        }}
        testID="auth-v2-otp-input"
      />

      <View style={styles.resendRow}>
        <LocaleUiText style={[styles.resendHint, { color: tokens.muted }]}>{t("otp.notReceived")}</LocaleUiText>
        <Pressable onPress={handleResend} disabled={resendCountdown > 0 || resending || loading}>
          <Text
            style={[
              styles.resendLink,
              { color: tokens.link },
              (resendCountdown > 0 || resending) && { opacity: 0.5 },
            ]}
          >
            {resendCountdown > 0
              ? t("otp.resendIn", { seconds: resendCountdown })
              : resending
                ? t("otp.resending")
                : t("otp.resend")}
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={onChangeNumber} style={styles.changeNumber}>
        <LocaleUiText style={[styles.changeNumberText, { color: tokens.link }]}>
          {t("authV2.otp.changeNumber")}
        </LocaleUiText>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
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
  },
  resendHint: { ...typography.caption },
  resendLink: { ...typography.captionStrong },
  changeNumber: { alignItems: "center", paddingVertical: spacing.sm },
  changeNumberText: { ...typography.captionStrong },
});
