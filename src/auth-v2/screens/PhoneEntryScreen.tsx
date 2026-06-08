import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { LegalConsentCheckboxes } from "@/components/legal/LegalConsentCheckboxes";
import { PhoneConfirmCard } from "@/auth-v2/components/PhoneConfirmCard";
import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import {
  isValidIndianLocalMobile,
  sanitizeLocalMobileInput,
  toE164FromDraft,
} from "@/auth-v2/phoneValidation";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import type { AuthV2PhoneDraft } from "@/auth-v2/types";
import { DEFAULT_AUTH_V2_COUNTRY_CODE } from "@/auth-v2/types";
import { useT } from "@/i18n";
import { formatDisplayPhone } from "@/utils/phone";
import { spacing, typography, useTheme } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner } from "@/components/ui";

interface PhoneEntryScreenProps {
  draft: AuthV2PhoneDraft;
  onDraftChange: (draft: AuthV2PhoneDraft) => void;
  step: "phone" | "confirm";
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsAcceptedChange: (value: boolean) => void;
  onPrivacyAcceptedChange: (value: boolean) => void;
  onContinueToConfirm: () => void;
  onConfirmSend: () => void;
  onBackFromConfirm: () => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function PhoneEntryScreen({
  draft,
  onDraftChange,
  step,
  termsAccepted,
  privacyAccepted,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  onContinueToConfirm,
  onConfirmSend,
  onBackFromConfirm,
  onBack,
  loading = false,
  error = null,
}: PhoneEntryScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { resolvedMode, colors } = useTheme();
  const tokens = authV2Tokens(colors, resolvedMode === "dark");
  const [focused, setFocused] = useState(false);

  const valid = useMemo(
    () =>
      draft.countryCode === DEFAULT_AUTH_V2_COUNTRY_CODE &&
      isValidIndianLocalMobile(draft.localNumber),
    [draft.countryCode, draft.localNumber]
  );

  const consentReady = termsAccepted && privacyAccepted;

  const displayPhone = useMemo(() => {
    if (!valid) return "";
    try {
      return formatDisplayPhone(toE164FromDraft(draft.countryCode, draft.localNumber));
    } catch {
      return "";
    }
  }, [draft, valid]);

  const footer =
    step === "phone" ? (
      <>
        {!online ? (
          <Banner tone="warning" message={t("common.offlineHint")} />
        ) : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <LegalConsentCheckboxes
          variant="auth"
          termsAccepted={termsAccepted}
          privacyAccepted={privacyAccepted}
          onTermsAcceptedChange={onTermsAcceptedChange}
          onPrivacyAcceptedChange={onPrivacyAcceptedChange}
        />
        <AuthV2PrimaryButton
          label={t("authV2.phone.continue")}
          loading={loading}
          loadingLabel={t("authV2.phone.checking")}
          disabled={!valid || !online || !consentReady}
          onPress={onContinueToConfirm}
          testID="auth-v2-phone-continue"
          activeBg={tokens.ctaActiveBg}
          activeText={tokens.ctaActiveText}
          mutedBg={tokens.ctaMutedBg}
          mutedText={tokens.ctaMutedText}
        />
      </>
    ) : null;

  return (
    <AuthShell
      title={t("authV2.phone.title")}
      subtitle={t("authV2.phone.subtitle")}
      footer={footer}
      onBack={step === "confirm" ? onBackFromConfirm : onBack}
      showBack
    >
      <View style={styles.row}>
        <View
          style={[
            styles.codeBox,
            {
              borderColor: focused ? tokens.link : tokens.inputBorder,
              backgroundColor: tokens.inputBg,
            },
          ]}
        >
          <Text style={[styles.codeText, { color: tokens.inputText }]}>+91</Text>
        </View>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: focused ? tokens.link : tokens.inputBorder,
              backgroundColor: tokens.inputBg,
              color: tokens.inputText,
            },
          ]}
          value={draft.localNumber}
          onChangeText={(text) =>
            onDraftChange({
              ...draft,
              localNumber: sanitizeLocalMobileInput(text),
            })
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("login.mobilePlaceholder")}
          placeholderTextColor={tokens.placeholder}
          keyboardType="phone-pad"
          maxLength={10}
          autoComplete="tel"
          textContentType="telephoneNumber"
          testID="auth-v2-phone-input"
        />
      </View>
      {step === "confirm" && displayPhone ? (
        <PhoneConfirmCard
          displayPhone={displayPhone}
          onConfirm={() => void onConfirmSend()}
          onBack={onBackFromConfirm}
          loading={loading}
        />
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  codeBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minWidth: 72,
    alignItems: "center",
  },
  codeText: { ...typography.bodyStrong },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
});
