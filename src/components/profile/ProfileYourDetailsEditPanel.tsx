import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Control, FieldErrors, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { DesignationPicker } from "@/components/profile/DesignationPicker";
import { SalutationPicker } from "@/components/profile/SalutationPicker";
import { EmailDomainSuggestionField } from "@/components/forms/EmailDomainSuggestionField";
import { KeyboardAwareField } from "@/components/forms/KeyboardAwareField";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { PROFILE_EDIT_NAV_FIELD_ORDER } from "@/utils/formFieldNavigation/fieldNavOrders";
import { Banner, TextField, LocaleUiText } from "@/components/ui";
import type { ProfileSalutationId } from "@/domain/profileSalutation";
import type { UserProfile } from "@/domain/types";
import {
  MAX_BUSINESS_NAME_CHANGES,
  MAX_EMAIL_CHANGES,
} from "@/domain/profileUpdatePolicy";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemeColors, useThemedStyles } from "@/theme";

interface ProfileYourDetailsEditPanelProps {
  user: UserProfile;
  control: Control<FieldValues>;
  displayNameError: string | null;
  businessNameLocked: boolean;
  emailLocked: boolean;
  businessNameRemaining: number;
  emailRemaining: number;
  displayNameRef: React.RefObject<TextInput | null>;
  onDisplayNameChange: () => void;
  onCancel: () => void;
}

export function ProfileYourDetailsEditPanel({
  user,
  control,
  displayNameError,
  businessNameLocked,
  emailLocked,
  businessNameRemaining,
  emailRemaining,
  displayNameRef,
  onDisplayNameChange,
  onCancel,
}: ProfileYourDetailsEditPanelProps) {
  const t = useT();
  const colors = useThemeColors();
  useFormFieldNavigation(PROFILE_EDIT_NAV_FIELD_ORDER);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      panel: {
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        padding: spacing.md,
        marginBottom: spacing.lg,
        gap: spacing.md,
      },
      header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      },
      title: { ...typography.bodyStrong, color: c.text },
      cancel: { ...typography.captionStrong, color: c.primary },
      policy: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      form: { gap: spacing.md },
    })
  );

  const showBusinessBanner =
    businessNameLocked ||
    businessNameRemaining < MAX_BUSINESS_NAME_CHANGES;
  const showEmailBanner =
    emailLocked ||
    (emailRemaining < MAX_EMAIL_CHANGES &&
      Boolean(user.businessEmail?.trim()));

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.primaryDark} />
          <LocaleUiText style={styles.title}>{t("identity.details.editingTitle")}</LocaleUiText>
        </View>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <LocaleUiText style={styles.cancel}>{t("identity.details.cancelEdit")}</LocaleUiText>
        </Pressable>
      </View>

      <LocaleUiText style={styles.policy}>{t("identity.details.editPolicyBrief")}</LocaleUiText>

      {showBusinessBanner ? (
        <Banner
          tone={businessNameLocked ? "warning" : "info"}
          message={
            businessNameLocked
              ? t("identity.details.lockedBusinessName")
              : t("profilePolicy.businessNameRemaining", { count: businessNameRemaining })
          }
        />
      ) : null}

      {showEmailBanner ? (
        <Banner
          tone={emailLocked ? "warning" : "info"}
          message={
            emailLocked
              ? t("identity.details.lockedEmail")
              : t("profilePolicy.emailRemaining", { count: emailRemaining })
          }
        />
      ) : null}

      <View style={styles.form}>
        <Controller
          control={control}
          name="salutation"
          render={({ field: { onChange, value } }) => (
            <SalutationPicker value={value} onChange={onChange} />
          )}
        />
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="displayName">
              <TextField
                ref={displayNameRef}
                navFieldKey="displayName"
                label={t("onboarding.profile.nameLabel")}
                value={value}
                onChangeText={(text) => {
                  onDisplayNameChange();
                  onChange(text);
                }}
                error={displayNameError}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="businessName"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="businessName">
              <TextField
                navFieldKey="businessName"
                label={t("onboarding.profile.businessLabel")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("identity.businessNameOptional")}
                hint={
                  businessNameLocked
                    ? t("identity.details.lockedBusinessName")
                    : t("identity.businessNameHint")
                }
                autoCapitalize="words"
                autoCorrect={false}
                editable={!businessNameLocked}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="workType"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="workType">
              <TextField
                navFieldKey="workType"
                label={t("onboarding.profile.fieldLabel")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("onboarding.profile.fieldPlaceholder")}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="designation"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="designation">
              <DesignationPicker value={value ?? ""} onChange={onChange} />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="businessEmail"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="businessEmail">
              <EmailDomainSuggestionField
                navFieldKey="businessEmail"
                label={t("onboarding.profile.emailLabel")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("onboarding.profile.emailPlaceholder")}
                hint={
                  emailLocked
                    ? t("identity.details.lockedEmail")
                    : t("onboarding.profile.emailHint")
                }
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!emailLocked}
              />
            </KeyboardAwareField>
          )}
        />
      </View>
    </View>
  );
}
