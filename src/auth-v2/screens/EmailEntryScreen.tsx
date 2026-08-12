import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner, LocaleUiText } from "@/components/ui";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailEntryScreenProps {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
  hint?: string | null;
  /** Optional chrome above the title (e.g. wizard progress). */
  headerTop?: React.ReactNode;
  /** Optional controls below the primary footer actions (normal document flow). */
  belowFooter?: React.ReactNode;
}

export function EmailEntryScreen({
  value,
  onChange,
  onContinue,
  onBack,
  loading = false,
  error = null,
  hint = null,
  headerTop = null,
  belowFooter = null,
}: EmailEntryScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { tokens } = useAuthV2Theme();
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
      headerTop={headerTop}
      footerPlacement="actionZone"
      footer={
        <>
          {hint ? <OnboardingInlineMessage tone="muted" message={hint} /> : null}
          {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
          {error ? <OnboardingInlineMessage tone="danger" message={error} /> : null}
          <AuthV2PrimaryButton
            label={t("authV2.email.continue")}
            loading={loading}
            loadingLabel={t("authV2.email.saving")}
            disabled={!valid || !online}
            onPress={onContinue}
            testID="auth-v2-email-continue"
            purpose="advance"
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
          <LocaleUiText style={[styles.footnote, { color: tokens.muted }]}>
            {t("authV2.email.footnote")}
          </LocaleUiText>
          {belowFooter}
        </>
      }
    >
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            backgroundColor: tokens.inputBg,
            borderColor: focused ? tokens.secondaryActiveFg : tokens.inputBorder,
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
