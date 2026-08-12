import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { AuthSecondaryActiveButton } from "@/auth-v2/components/AuthSecondaryActiveButton";
import { AuthTertiaryTextAction } from "@/auth-v2/components/AuthTertiaryTextAction";
import {
  ReviewInfoCard,
  ReviewStatusBadge,
} from "@/auth-v2/components/ReviewEditShell";
import { BusinessConstitutionField } from "@/auth-v2/components/BusinessConstitutionField";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import {
  REVIEW_CONTACTS_SECURITY_NOTE,
  REVIEW_LOGO_USAGE_POINTS,
  REVIEW_EMAIL_CHANGE_AVAILABLE,
  REVIEW_PHONE_CHANGE_AVAILABLE,
} from "@/auth-v2/reviewEditCopy";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";

export function ReviewIdentityEditFields({
  displayName,
  businessName,
  constitution,
  onDisplayNameChange,
  onBusinessNameChange,
}: {
  displayName: string;
  businessName: string;
  constitution: string;
  onDisplayNameChange: (v: string) => void;
  onBusinessNameChange: (v: string) => void;
}) {
  const { tokens } = useAuthV2Theme();
  const practice = isIndividualProfessionalPractice(constitution);
  return (
    <View style={styles.stack}>
      <OnboardingV2TextField
        navFieldKey="displayName"
        label="Full legal name"
        required
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="Account owner / authorised person"
        autoCapitalize="words"
        maxLength={80}
      />
      <Text style={[styles.helper, { color: tokens.muted }]}>
        Name of the person responsible for this Vyaamikk account.
      </Text>
      <OnboardingV2TextField
        navFieldKey="businessName"
        label={practice ? "Practice / professional name" : "Business / firm / practice name"}
        required={!practice}
        value={businessName}
        onChangeText={onBusinessNameChange}
        placeholder={practice ? "e.g. practice name as used professionally" : "Registered or trading name"}
        autoCapitalize="words"
        maxLength={120}
      />
      <Text style={[styles.helper, { color: tokens.muted }]}>
        {practice
          ? "Optional separate practice name if different from your legal name."
          : "Appears on supported records and documents as your business identity."}
      </Text>
    </View>
  );
}

export function ReviewLogoEditFields({
  previewUri,
  onChoose,
  onRemove,
  choosing = false,
}: {
  previewUri: string | null;
  onChoose: () => void;
  onRemove: () => void;
  choosing?: boolean;
}) {
  const { tokens } = useAuthV2Theme();
  const hasLogo = Boolean(previewUri);

  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.logoStage,
          { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
        ]}
        accessibilityRole="image"
        accessibilityLabel={hasLogo ? "Business logo preview" : "No logo added"}
      >
        {hasLogo && previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.logoImage} resizeMode="contain" />
        ) : (
          <View style={styles.logoEmpty}>
            <ReviewStatusBadge kind="optional" />
            <Text style={[styles.logoEmptyTitle, { color: tokens.heading }]}>No logo added</Text>
            <Text style={[styles.helper, { color: tokens.muted, textAlign: "center" }]}>
              Optional branding for supported documents
            </Text>
          </View>
        )}
      </View>

      <AuthSecondaryActiveButton
        label={hasLogo ? "Change logo" : "Choose logo"}
        onPress={onChoose}
        disabled={choosing}
        loading={choosing}
        loadingLabel={hasLogo ? "Updating…" : "Choosing…"}
        purpose="modify"
        testID="review-logo-choose"
      />
      {hasLogo ? (
        <AuthTertiaryTextAction
          label="Remove logo"
          onPress={onRemove}
          purpose="navigate"
          accessibilityLabel="Remove logo"
          testID="review-logo-remove"
          textStyle={{ color: tokens.muted }}
        />
      ) : null}

      <ReviewInfoCard>
        <Text style={[styles.infoTitle, { color: tokens.heading }]}>Where your logo appears</Text>
        {REVIEW_LOGO_USAGE_POINTS.map((line) => (
          <Text key={line} style={[styles.infoLine, { color: tokens.body }]}>
            {line}
          </Text>
        ))}
      </ReviewInfoCard>
    </View>
  );
}

/** @deprecated Prefer VerifiedContactChangePanel — kept for static/read-only fixtures. */
export function ReviewVerifiedContactsFields({
  phoneE164,
  email,
  emailVerified,
}: {
  phoneE164: string;
  email: string;
  emailVerified: boolean;
}) {
  const { tokens } = useAuthV2Theme();
  void REVIEW_PHONE_CHANGE_AVAILABLE;
  void REVIEW_EMAIL_CHANGE_AVAILABLE;
  void REVIEW_CONTACTS_SECURITY_NOTE;

  return (
    <View style={styles.stack}>
      <ReviewInfoCard>
        <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Mobile number</Text>
        <Text style={[styles.fieldValue, { color: tokens.heading }]} selectable>
          {maskMobile(phoneE164)}
        </Text>
        <ReviewStatusBadge kind="verified" />
      </ReviewInfoCard>

      <ReviewInfoCard>
        <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Email</Text>
        <Text style={[styles.fieldValue, { color: tokens.heading }]} selectable>
          {email.trim() ? email.trim() : "Not added"}
        </Text>
        <ReviewStatusBadge kind={emailVerified && email.trim() ? "verified" : "not_added"} />
      </ReviewInfoCard>
    </View>
  );
}

export function ReviewGstinEditFields({
  gstin,
  gstinState,
  onChange,
}: {
  gstin: string;
  gstinState: GstinVerificationState;
  onChange: (raw: string) => void;
}) {
  const { tokens } = useAuthV2Theme();
  return (
    <View style={styles.stack}>
      <View style={styles.rowBetween}>
        <Text style={[styles.fieldLabel, { color: tokens.muted }]}>GST registration</Text>
        <ReviewStatusBadge kind={gstin.trim() ? "optional" : "not_added"} />
      </View>
      <OnboardingV2TextField
        navFieldKey="gstin"
        label="GSTIN"
        value={gstin}
        onChangeText={onChange}
        placeholder="15-character GSTIN (optional)"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={15}
      />
      {gstin.trim() && gstinState === "formatInvalid" ? (
        <Text style={[styles.helper, { color: tokens.danger }]}>
          Enter a valid 15-character GSTIN, or leave blank.
        </Text>
      ) : (
        <Text style={[styles.helper, { color: tokens.muted }]}>
          Format and checksum validation only. Not a GSTN / government verification.
        </Text>
      )}
    </View>
  );
}

export function ReviewConstitutionEditFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { tokens } = useAuthV2Theme();
  return (
    <View style={styles.stack}>
      {value.trim() ? (
        <ReviewInfoCard>
          <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Current selection</Text>
          <Text style={[styles.fieldValue, { color: tokens.heading }]}>{value.trim()}</Text>
        </ReviewInfoCard>
      ) : (
        <ReviewStatusBadge kind="not_added" />
      )}
      <BusinessConstitutionField value={value} onChange={onChange} />
      <Text style={[styles.helper, { color: tokens.muted }]}>
        Select the structure that best matches how this business or practice is organised.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  helper: { ...typography.caption, lineHeight: 18 },
  fieldLabel: {
    ...typography.micro,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fieldValue: { ...typography.body, fontSize: 18, fontWeight: "600" },
  infoTitle: { ...typography.bodyStrong },
  infoLine: { ...typography.caption, lineHeight: 18 },
  logoStage: {
    minHeight: 180,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: spacing.lg,
  },
  logoImage: { width: "100%", height: 160 },
  logoEmpty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  logoEmptyTitle: { ...typography.titleMd, fontSize: 18 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
