import React, { useMemo, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, View } from "react-native";

import { isAuthLegalConsentReady } from "@/components/legal/authConsentLine";
import { LegalConsentCheckboxes } from "@/components/legal/LegalConsentCheckboxes";
import { PhoneConfirmCard } from "@/auth-v2/components/PhoneConfirmCard";
import { AuthShell } from "@/auth-v2/components/AuthShell";
import { PhoneEntryBrandSignature } from "@/auth-v2/components/PhoneEntryBrandSignature";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import {
  ingestIndianMobileFieldInput,
  isPhoneContinueEnabled,
  isValidIndianLocalMobile,
  toE164FromDraft,
} from "@/auth-v2/phoneValidation";
import { onboardingMark } from "@/auth-v2/onboardingPerfProbe";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { DEFAULT_AUTH_V2_COUNTRY_CODE, type AuthV2PhoneDraft } from "@/auth-v2/types";
import { useT } from "@/i18n";
import { formatDisplayPhone } from "@/utils/phone";
import { spacing, typography } from "@/theme";
import { useIsOnline } from "@/state/network";
import { Banner } from "@/components/ui";
import { PhoneAuthErrorPanel } from "@/auth-v2/components/PhoneAuthErrorPanel";

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
  errorTitle?: string | null;
  /** Safe Firebase Auth code e.g. auth/missing-client-identifier */
  errorDiagnostic?: string | null;
  onCopyErrorDiagnostics?: () => void;
  /** Presentation host without legal routes (dev harness). */
  onOpenLegalDocument?: (doc: import("@/config/legal").LegalDocumentId) => void;
}

export function PhoneEntryScreen({
  draft,
  onDraftChange,
  step,
  termsAccepted,
  privacyAccepted,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  onContinueToConfirm: _onContinueToConfirm,
  onConfirmSend,
  onBackFromConfirm,
  onBack,
  loading = false,
  error = null,
  errorTitle = null,
  errorDiagnostic = null,
  onCopyErrorDiagnostics,
  onOpenLegalDocument,
}: PhoneEntryScreenProps) {
  const t = useT();
  const online = useIsOnline();
  const { tokens } = useAuthV2Theme();
  const [focused, setFocused] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);

  const valid = useMemo(
    () =>
      draft.countryCode === DEFAULT_AUTH_V2_COUNTRY_CODE &&
      isValidIndianLocalMobile(draft.localNumber),
    [draft.countryCode, draft.localNumber]
  );

  const consentReady = isAuthLegalConsentReady(termsAccepted, privacyAccepted);
  const continueEnabled = isPhoneContinueEnabled({ valid, online, loading });

  const displayPhone = useMemo(() => {
    if (!valid) return "";
    try {
      return formatDisplayPhone(toE164FromDraft(draft.countryCode, draft.localNumber));
    } catch {
      return "";
    }
  }, [draft, valid]);

  const handlePrimary = () => {
    Keyboard.dismiss();
    if (!consentReady) {
      setConsentPrompt(true);
      return;
    }
    setConsentPrompt(false);
    onboardingMark("continueTap");
    // Happy path: send immediately. Confirm card remains for number-change review.
    onConfirmSend();
  };

  const footer =
    step === "phone" ? (
      <>
        {!online ? <Banner tone="warning" message={t("common.offlineHint")} /> : null}
        {formatError ? <OnboardingInlineMessage tone="danger" message={formatError} /> : null}
        {consentPrompt && !consentReady ? (
          <OnboardingInlineMessage
            tone="danger"
            message="Accept Terms and Privacy to continue."
          />
        ) : null}
        <PhoneAuthErrorPanel
          title={errorTitle}
          message={error}
          diagnostic={errorDiagnostic}
          onCopyDiagnostics={onCopyErrorDiagnostics}
        />
        <LegalConsentCheckboxes
          variant="authCompact"
          termsAccepted={termsAccepted}
          privacyAccepted={privacyAccepted}
          onOpenDocument={onOpenLegalDocument}
          onTermsAcceptedChange={(v) => {
            onTermsAcceptedChange(v);
            if (v && privacyAccepted) setConsentPrompt(false);
          }}
          onPrivacyAcceptedChange={(v) => {
            onPrivacyAcceptedChange(v);
            if (v && termsAccepted) setConsentPrompt(false);
          }}
        />
        <AuthV2PrimaryButton
          label={t("authV2.phone.continue")}
          loading={loading}
          loadingLabel={t("authV2.phone.sending")}
          disabled={!continueEnabled}
          onPress={handlePrimary}
          testID="auth-v2-phone-continue"
          purpose="advance"
          activeBg={tokens.ctaActiveBg}
          activeText={tokens.ctaActiveText}
          mutedBg={tokens.ctaMutedBg}
          mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
        />
        <PhoneEntryBrandSignature />
      </>
    ) : error ? (
      <PhoneAuthErrorPanel
        title={errorTitle}
        message={error}
        diagnostic={errorDiagnostic}
        onCopyDiagnostics={onCopyErrorDiagnostics}
      />
    ) : null;

  return (
    <AuthShell
      title={t("authV2.phone.title")}
      subtitle={t("authV2.phone.subtitle")}
      footer={footer}
      footerPlacement="actionZone"
      headerTop={null}
      onBack={step === "confirm" ? onBackFromConfirm : onBack}
      showBack={step === "confirm" ? true : Boolean(onBack)}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.codeBox,
            {
              borderColor: focused ? tokens.secondaryActiveFg : tokens.inputBorder,
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
              borderColor: focused ? tokens.secondaryActiveFg : tokens.inputBorder,
              backgroundColor: tokens.inputBg,
              color: tokens.inputText,
            },
          ]}
          value={draft.localNumber}
          onChangeText={(text) => {
            const ingested = ingestIndianMobileFieldInput(text);
            if (ingested.status === "rejected") {
              setFormatError(ingested.reason);
              return;
            }
            setFormatError(null);
            onDraftChange({
              ...draft,
              localNumber: ingested.status === "empty" ? "" : ingested.localDigits,
            });
            const nextValid =
              draft.countryCode === DEFAULT_AUTH_V2_COUNTRY_CODE &&
              ingested.status === "complete";
            if (nextValid) onboardingMark("phoneInputValid");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("login.mobilePlaceholder")}
          placeholderTextColor={tokens.placeholder}
          keyboardType="phone-pad"
          inputMode="numeric"
          maxLength={18}
          autoComplete="tel"
          textContentType="telephoneNumber"
          importantForAutofill="yes"
          editable={!loading && step === "phone"}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (continueEnabled) handlePrimary();
          }}
          accessibilityLabel="Mobile number, 10 digits"
          testID="auth-v2-phone-input"
        />
      </View>
      {step === "confirm" && displayPhone ? (
        <PhoneConfirmCard
          displayPhone={displayPhone}
          onConfirm={() => {
            onboardingMark("continueTap");
            void onConfirmSend();
          }}
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
