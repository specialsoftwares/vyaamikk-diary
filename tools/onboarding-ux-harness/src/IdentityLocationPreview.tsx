import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { BusinessConstitutionField } from "@/auth-v2/components/BusinessConstitutionField";
import { LocationConfirmationCard } from "@/auth-v2/components/LocationConfirmationCard";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";
import { isIdentityDetailsContinueEnabled } from "@/onboarding/profileIdentityModel";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";
import { spacing, typography } from "@/theme";

export type PinUi = "idle" | "looking_up" | "confirmed" | "not_found" | "unavailable" | "choices";

export interface ConfirmedPinPreview {
  locality: string | null;
  district: string;
  state: string;
}

export interface PinChoicePreview {
  localities: string[];
  district: string;
  state: string;
}

interface IdentityLocationPreviewProps {
  phase: "details" | "location";
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  gstinState: GstinVerificationState;
  pinCode: string;
  pinUi: PinUi;
  confirmedPin: ConfirmedPinPreview | null;
  pinChoices: PinChoicePreview | null;
  selectedLocality: string | null;
  onDisplayNameChange: (v: string) => void;
  onBusinessNameChange: (v: string) => void;
  onConstitutionChange: (v: string) => void;
  onGstinChange: (v: string) => void;
  onPinChange: (v: string) => void;
  onSelectLocality: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function IdentityLocationPreview({
  phase,
  displayName,
  businessName,
  constitution,
  gstin,
  gstinState,
  pinCode,
  pinUi,
  confirmedPin,
  pinChoices,
  selectedLocality,
  onDisplayNameChange,
  onBusinessNameChange,
  onConstitutionChange,
  onGstinChange,
  onPinChange,
  onSelectLocality,
  onContinue,
  onBack,
}: IdentityLocationPreviewProps) {
  const { tokens } = useAuthV2Theme();
  const detailsReady = isIdentityDetailsContinueEnabled({
    displayName,
    accountKind: "business",
    businessName,
    constitution,
    gstin,
    gstinVerificationState: gstinState,
  });
  const locationReady = pinUi === "confirmed";

  return (
    <OnboardingV2Shell
      title={
        phase === "location"
          ? "Confirm your location"
          : "Tell us about your business or practice"
      }
      subtitle={
        phase === "location"
          ? "Enter your 6-digit PIN. We'll confirm the place."
          : "These details help Vyaamikk identify your business, firm or professional practice on records and documents."
      }
      onBack={onBack}
      headerTop={<WizardProgress step="businessIdentity" identityPhase={phase} />}
      footer={
        <AuthV2PrimaryButton
          label="Continue"
          disabled={phase === "details" ? !detailsReady : !locationReady}
          onPress={onContinue}
          testID="harness-identity-continue"
          activeBg={tokens.ctaActiveBg}
          activeText={tokens.ctaActiveText}
          mutedBg={tokens.ctaMutedBg}
          mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
        />
      }
    >
      {phase === "details" ? (
        <>
          <OnboardingV2TextField
            navFieldKey="displayName"
            label="Your full legal name"
            required
            value={displayName}
            onChangeText={onDisplayNameChange}
            placeholder="Account owner / authorised person"
            autoCapitalize="words"
            maxLength={80}
          />
          <OnboardingV2TextField
            navFieldKey="businessName"
            label={
              isIndividualProfessionalPractice(constitution)
                ? "Practice / professional name"
                : "Business / firm / practice name"
            }
            required={!isIndividualProfessionalPractice(constitution)}
            value={businessName}
            onChangeText={onBusinessNameChange}
            placeholder={
              isIndividualProfessionalPractice(constitution)
                ? "e.g. Shivam Saurav, Advocate"
                : "e.g. Sharma Hardware"
            }
            autoCapitalize="words"
            maxLength={120}
          />
          <BusinessConstitutionField value={constitution} onChange={onConstitutionChange} />
          <OnboardingV2TextField
            navFieldKey="gstin"
            label="GSTIN (optional)"
            value={gstin}
            onChangeText={onGstinChange}
            placeholder="15-character GSTIN"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
          />
          {gstin.trim() && gstinState === "formatInvalid" ? (
            <Text style={[styles.optional, { color: tokens.danger }]}>
              Enter a valid 15-character GSTIN, or leave blank.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <OnboardingV2TextField
            navFieldKey="pinCode"
            label="PIN code"
            required
            value={pinCode}
            onChangeText={(v) => onPinChange(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit PIN"
            keyboardType="number-pad"
            maxLength={6}
          />
          {pinUi === "looking_up" ? (
            <View style={styles.lookup}>
              <ActivityIndicator color={tokens.ctaActiveText} />
              <Text style={[styles.optional, { color: tokens.muted, marginTop: 0 }]}>Looking up…</Text>
            </View>
          ) : null}
          {pinUi === "not_found" ? (
            <OnboardingInlineMessage
              tone="danger"
              message="Couldn't find this PIN. Check and try again."
            />
          ) : null}
          {pinUi === "unavailable" ? (
            <OnboardingInlineMessage
              tone="danger"
              message="Couldn't look up the PIN right now. Try again."
            />
          ) : null}
          {pinUi === "choices" && pinChoices ? (
            <View style={styles.choices}>
              {pinChoices.localities.map((loc) => {
                const selected = selectedLocality === loc;
                return (
                  <Pressable
                    key={loc}
                    onPress={() => onSelectLocality(loc)}
                    style={[
                      styles.choice,
                      {
                        backgroundColor: selected ? tokens.ctaActiveBg : tokens.cardBg,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? tokens.ctaActiveText : tokens.body, ...typography.caption }}>
                      {loc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {pinUi === "confirmed" && confirmedPin ? (
            <LocationConfirmationCard
              locality={confirmedPin.locality}
              district={confirmedPin.district}
              state={confirmedPin.state}
              confirmed
            />
          ) : null}
        </>
      )}
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  optional: { ...typography.caption, lineHeight: 18, marginTop: spacing.sm },
  lookup: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  choice: {
    ...typography.caption,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    overflow: "hidden",
  },
});
