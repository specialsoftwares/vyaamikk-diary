import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailEntryScreenProps {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
  hint?: string | null;
}

export function EmailEntryScreen({
  value,
  onChange,
  onContinue,
  onBack,
  loading = false,
  error = null,
  hint = null,
}: EmailEntryScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const valid = useMemo(() => {
    const trimmed = value.trim();
    return trimmed.length > 0 && EMAIL_RE.test(trimmed) && trimmed.length <= 120;
  }, [value]);

  return (
    <AuthShell
      title={t("authV2.email.title")}
      subtitle={t("authV2.email.subtitle")}
      onBack={onBack}
      showBack={Boolean(onBack)}
      footer={
        <>
          {hint ? <Banner tone="info" message={hint} /> : null}
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}
          <AuthV2PrimaryButton
            label={t("authV2.email.continue")}
            loading={loading}
            loadingLabel={t("authV2.email.saving")}
            disabled={!valid || !online}
            onPress={onContinue}
            testID="auth-v2-email-continue"
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
          />
          <LocaleUiText style={[styles.footnote, { color: tokens.muted }]}>
            {t("authV2.email.footnote")}
          </LocaleUiText>
        </>
      }
    >
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            backgroundColor: tokens.inputBg,
            borderColor: focused ? tokens.primary : tokens.inputBorder,
            color: tokens.inputText,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={t("authV2.email.placeholder")}
        placeholderTextColor={tokens.placeholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={120}
        editable={!loading}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="done"
        onSubmitEditing={valid ? onContinue : undefined}
        testID="auth-v2-email-input"
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  footnote: {
    ...typography.caption,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.xs,
  },
});
